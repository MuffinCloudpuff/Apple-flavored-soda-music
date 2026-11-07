const fetch = require('node-fetch');
fetch('http://localhost:3000/api/bilibili/proxy?url=' + encodeURIComponent('https://i0.hdslb.com/bfs/archive/92e5dbab278fdb7abddda65c22f32b5267b39bc1.jpg'))
.then(async res => {
    const buff = await res.buffer();
    console.log("Length expected:", res.headers.get('content-length'), "Actual:", buff.length);
}).catch(console.error);
