const express = require('express')
const app = express()
const server = app.listen(8080, () => console.log('Listening...'))

require('dotenv').config()

const CORS_ORIGIN = '*'
const cors = require('cors')
// const io = require('socket.io')(server, { cors: { origin: CORS_ORIGIN } })

app.use(cors({ origin: CORS_ORIGIN }))

// io.on('connection', socket => {
//     console.log(`Socket Connected: ${socket.id}`)
// })

app.get('/', (req, res) => {
    res.json({
        message: 'Hello World!',
        time: new Date()
    })
})

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