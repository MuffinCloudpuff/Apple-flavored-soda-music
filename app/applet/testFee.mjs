async function test() {
    try {
        const res = await fetch("http://localhost:3000/api/netease/search?keywords=" + encodeURIComponent("绿光孙燕姿")).then(r => r.json());
        if (res.result && res.result.songs) {
            res.result.songs.slice(0, 5).forEach(t => console.log(t.name, "fee:", t.fee));
        }
    } catch(e) {}
}
test();
