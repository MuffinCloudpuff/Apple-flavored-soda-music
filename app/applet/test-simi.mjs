import fetch from "node-fetch"; 
async function test() { 
    const res = await fetch("http://127.0.0.1:3000/api/simi/playlist?songid=347230"); 
    const data = await res.json(); 
    console.log(JSON.stringify(data, null, 2)); 
} 
test();
