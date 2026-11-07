fetch('http://127.0.0.1:3000/api/health').then(r => r.json()).then(console.log).catch(console.error);
fetch('http://127.0.0.1:3000/api/bilibili/search?keyword=test').then(r => r.json()).then(console.log).catch(console.error);
