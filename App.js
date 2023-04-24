const express = require('express')
const app = express()
const server = app.listen(8080, () => console.log('Listening...'))

require('dotenv').config()

const { PassThrough } = require('stream')
const { v4: uuidv4 } = require('uuid')
const CORS_ORIGIN = '*'
const cors = require('cors')

const YoutubeSearchApi = require('youtube-search-api')
const ytdl = require('ytdl-core')

// const { MongoClient } = require('mongodb')
// const mongo = new MongoClient(process.env.MONGO_URL)
// const _mongoConnect = mongo.connect()

app.use(cors({ origin: CORS_ORIGIN }))
// app.use('/', (req, res) => res.sendStatus(200))

const bytesToMegaBytes = buf => Buffer.byteLength(buf) / 1e+6

app.get('/api',async (req, res) => {
    if(!('keywords' in req.query)) return res.sendStatus(400)
    const searchResult = await youtubeKeywordSearch(req.query.keywords)
        
    if(searchResult.error) return res.sendStatus(404)
    const url = `https://www.youtube.com/watch?v=${searchResult.data.id}`

    try {
        // https://stackoverflow.com/questions/19553837/node-js-piping-the-same-readable-stream-into-multiple-writable-targets
        const download = ytdl(url, { filter: format => format.hasVideo && format.hasAudio })
        // const cacheDownload = ytdl(url, { filter: format => format.hasVideo && format.hasAudio })
        // const info = await ytdl.getInfo(searchResult.data.id)
        // const formats = info.formats.find(format => format.hasVideo && format.hasAudio)
        // const { codecs, videoCodec, audioCodec } = formats
        
        // const cachePassThrough = new PassThrough()

        res.setHeader('Content-Type', 'audio/mp4')

        // CacheAudio({ stream: cacheDownload, url, keywords: req.query.keywords })

        download.pipe(res)
    } catch(err) {
        console.log(err)
        res.status(500).send(err.message)
    }
})

async function CacheAudio({ stream, url='', keywords='' }={}) {
    if(!(stream instanceof PassThrough)) return console.error('Failed to cache, Stream invalid', stream)

    console.time('mongo')
    await mongo.connect()

    console.log('[+] Cache Connected')
    const cache = mongo.db('Database').collection('Cache')
    const expireTime = 5
    const item = await cache.findOne({ keywords })

    console.log(!!item)

    if(item === null) {
        try {
            const chunks = []
            const buffer = await new Promise((resolve, reject) => {
                stream.on('data', chunk => chunks.push(chunk))
                stream.on('end', () => resolve(Buffer.concat(chunks)))
                stream.on('error', err => reject(err))
            })

            await cache.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
            await cache.insertOne({
                url, keywords,
                uuid: uuidv4(),
                buffer: buffer,
                megabyte: bytesToMegaBytes(buffer),
                bytes: Buffer.byteLength(buffer),
                expiresAt: new Date(Date.now() + expireTime * 60 * 1000)
            })
        } catch(err) {
            console.error(err)
        }
    } else {
        const binary = item.buffer.buffer//.match(/"(.*?)"/g)?.[0]

        // console.log(binary)
    }

    console.timeEnd('mongo')
    mongo.close()

    console.log('[-] Cache Closed')
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