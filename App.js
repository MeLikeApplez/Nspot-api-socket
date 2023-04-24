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
    if(req.path !== '/api' && req.path !== '/api/count') return res.sendStatus(200)
    
    next()
})

const bytesToMegaBytes = buf => Buffer.byteLength(buf) / 1e+6
const formatMemoryUsage = data => Math.round(data / 1024 / 1024 * 100) / 100

const memoryData = process.memoryUsage()
const memoryUsage = formatMemoryUsage(memoryData.rss + memoryData.heapTotal + memoryData.heapUsed + memoryData.external + memoryData.arrayBuffers)

console.log(
    `\x1b[34mMemory: ${memoryUsage} MB\x1b[37m`
)

app.get('/api/count', (req ,res) => {
    const getJSON = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'Cache.json'), 'utf-8'))

    fs.writeFileSync(path.join(__dirname, 'Cache.json'), JSON.stringify({
        ...getJSON(),
        count: getJSON()?.count + 1 ?? 0,
        lastUpdated: new Date()
    }))

    res.json(getJSON())
})

app.get('/api',async (req, res) => {
    if(!('keywords' in req.query)) return res.sendStatus(400)
    const searchResult = await youtubeKeywordSearch(req.query.keywords)
        
    if(searchResult.error) return res.sendStatus(404)
    const url = `https://www.youtube.com/watch?v=${searchResult.data.id}`

    try {
        // https://stackoverflow.com/questions/19553837/node-js-piping-the-same-readable-stream-into-multiple-writable-targets
        const download = ytdl(url, { filter: format => format.hasVideo && format.hasAudio })
        // const info = await ytdl.getInfo(searchResult.data.id)
        // const formats = info.formats.find(format => format.hasVideo && format.hasAudio)
        // const { codecs, videoCodec, audioCodec } = formats
        
        res.setHeader('Content-Type', 'audio/mp4')

        // CacheAudio({ stream: cacheDownload, url, keywords: req.query.keywords })

        download.pipe(res)
    } catch(err) {
        console.log(err)
        res.status(500).send(err.toString())
    }
})

async function CacheAudio({ stream, url='', keywords='' }={}) {
    if(!(stream instanceof PassThrough)) return console.error('Failed to cache, Stream invalid', stream)

    
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