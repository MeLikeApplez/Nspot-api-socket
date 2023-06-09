const express = require('express')
const app = express()
const server = app.listen(8080, () => console.log('Listening...'))

require('dotenv').config()

const { PassThrough } = require('stream')
const fs = require('fs')
const path = require('path')

const { v4: uuidv4 } = require('uuid')
const CORS_ORIGIN = '*'
const cors = require('cors')

const YoutubeSearchApi = require('youtube-search-api')
const ytdl = require('ytdl-core')

app.use(cors({ origin: CORS_ORIGIN }))
app.use((req, res, next) => {
    if(req.path !== '/api' && req.path !== '/api/count' && req.path !== '/api/cache' && req.path !== '/api/cache-expire') return res.sendStatus(200)
    
    next()
})

const bytesToMegaBytes = buf => Buffer.byteLength(buf) / 1e+6
const formatMemoryUsage = data => Math.round(data / 1024 / 1024 * 100) / 100

const memoryData = process.memoryUsage()
const memoryUsage = formatMemoryUsage(memoryData.rss + memoryData.heapTotal + memoryData.heapUsed + memoryData.external + memoryData.arrayBuffers)
const CACHE_LIMIT = 100
const CACHE_TIMEOUTS = []

CacheExpireUpdate()

console.log(
    `\x1b[34mMemory: ${memoryUsage} MB\x1b[37m`
)

app.get('/api/cache', (req, res) => {
    const stats = CacheStats()

    res.json(stats)
})

app.get('/api/cache-expire', (req, res) => {
    const stats = CacheExpireStats()

    res.json(stats)
})

app.get('/api/count', (req ,res) => {
    const getJSON = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'Cache.json'), 'utf-8'))
    const stats = () => fs.statSync(path.join(__dirname, 'Cache.json'))

    const newData = JSON.stringify({
        ...getJSON(),
        count: getJSON()?.count + 1 ?? 0,
        lastUpdated: new Date()
    })

    fs.writeFileSync(path.join(__dirname, 'Cache.json'), newData)

    res.json({
        ...getJSON(),
        size: stats().size
    })
})

app.get('/api',async (req, res) => {
    if(!('keywords' in req.query)) return res.sendStatus(400)
    const searchResult = await youtubeKeywordSearch(req.query.keywords)
        
    if(searchResult.error) return res.sendStatus(404)
    const url = `https://www.youtube.com/watch?v=${searchResult.data.id}`

    try {
        const cachePath = path.join(__dirname, 'Cache')
        const folder = fs.readdirSync(cachePath)
        const existsInCache = folder.some(filename => filename === req.query.keywords + '.mp4')

        if(existsInCache) {
            res.setHeader('Content-Type', 'audio/mp4')

            console.log(`\x1b[32mCached Audio: ${req.query.keywords}\x1b[37m`)

            fs.createReadStream(path.join(cachePath, req.query.keywords + '.mp4')).pipe(res)

            return
        }

        // https://stackoverflow.com/questions/19553837/node-js-piping-the-same-readable-stream-into-multiple-writable-targets
        const download = ytdl(url, { filter: format => format.hasVideo && format.hasAudio })
        const cacheDownload = ytdl(url, { filter: format => format.hasVideo && format.hasAudio })

        // const info = await ytdl.getInfo(searchResult.data.id)
        // const formats = info.formats.find(format => format.hasVideo && format.hasAudio)
        // const { codecs, videoCodec, audioCodec } = formats
        
        res.setHeader('Content-Type', 'audio/mp4')

        // CacheAudio({ stream: cacheDownload, url, keywords: req.query.keywords })

        download.pipe(res)

        download.on('end', () => {
            CacheAudio({ stream: cacheDownload, keywords: `${req.query.keywords}.mp4` })
        })
    } catch(err) {
        console.log(err)
        res.status(500).send(err.toString())
    }
})

function CacheExpireUpdate(updateExpireJSON=false, filename) {
    const expirePath = path.join(__dirname, 'Cache/expire.json')
    const expireStats = CacheExpireStats()
    const timeLimit = 10

    if(updateExpireJSON) {
        const cachePath = path.join(__dirname, 'Cache/' + filename)
        const uuid = uuidv4()
        const timeToExpire = new Date()

        timeToExpire.setTime(new Date().getTime() + (timeLimit * 60000))

        const metadata = {
            uuid, filename, timeToExpire,
            timeLimit: timeLimit * 60000,
            pathname: cachePath,
        }
        const expire = {
            ...metadata,
            timeout: setTimeout(() => {
                try {
                    const updatedExpireStats = CacheExpireStats()

                    CACHE_TIMEOUTS.splice(CACHE_TIMEOUTS.findIndex(v => v.uuid === uuid), 1)
                    updatedExpireStats.splice(updatedExpireStats.findIndex(v => v.uuid === uuid), 1)
                    fs.unlinkSync(cachePath)

                    fs.writeFileSync(expirePath, JSON.stringify(updatedExpireStats, null, 4))
                } catch {}
            }, timeLimit * 60000)
        }

        fs.writeFileSync(expirePath, JSON.stringify([...expireStats, metadata], null, 4))

        console.log(expire)

        CACHE_TIMEOUTS.push(expire)
    } else {
        const remove = stat => {
            try {
                const updatedExpireStats = CacheExpireStats()

                CACHE_TIMEOUTS.splice(CACHE_TIMEOUTS.findIndex(v => v.uuid === stat.uuid), 1)
                updatedExpireStats.splice(updatedExpireStats.findIndex(v => v.uuid === stat.uuid), 1)
                fs.unlinkSync(stat.pathname)

                fs.writeFileSync(expirePath, JSON.stringify(updatedExpireStats, null, 4))
            } catch(err) {
                console.log(err)
            }
        }

        for(let i = 0; i < expireStats.length; i++) {
            const stat = expireStats[i]

            if(CACHE_TIMEOUTS.findIndex(v => v.uuid === stat.uuid) !== -1) continue
            const timeLeft = new Date(stat.timeToExpire).getTime() - Date.now()
         
            if(timeLeft < 0) {
                remove(stat)

                continue
            }

            setTimeout(() => remove(stat), timeLeft)
        }
    }
}

function CacheExpireStats() {
    const expirePath = path.join(__dirname, 'Cache/expire.json')
    const stats = JSON.parse(fs.readFileSync(expirePath, 'utf-8'))
    
    return stats
}

function CacheStats() {
    const cachePath = path.join(__dirname, 'Cache')
    const folder = fs.readdirSync(cachePath)
    const stats = {
        files: folder.map(filename => {
            const data = Object.assign(fs.statSync(path.join(cachePath, filename)), { filename })
    
            data.megabytes = data.size / 1e+6
    
            return data
        })
    }

    const totalSize = stats.files.length > 0 ? stats.files.map(v => v.size).reduce((t, v) => t + v) : 0

    stats.totalSize = totalSize
    stats.totalSizeMegabytes = totalSize / 1e+6

    return stats
}

async function CacheAudio({ stream, keywords='' }={}) {
    if(!(stream instanceof PassThrough)) return console.error('Failed to cache, Stream invalid', stream)

    const stats = CacheStats()
    const cachePath = path.join(__dirname, 'Cache')

    if(stats.totalSizeMegabytes >= CACHE_LIMIT) return console.log('Cache Limit')

    const writeStream = fs.createWriteStream(path.join(cachePath, keywords))

    console.log(`Caching: ${keywords}`)

    stream.pipe(writeStream)

    stream.on('end', () => CacheExpireUpdate(true, keywords))
}

async function youtubeKeywordSearch(keywords) {
    try {
        const search = await YoutubeSearchApi.GetListByKeyword(keywords, false, 1)
        const { items } = search
        
        // empty results
        if(items.length <= 0) return { data: null, error: 'Not Found' }

        return{ data:  items[0] ,error: null }

    } catch(err) {
        return { data: null, error: JSON.stringify(err) }
    }
}