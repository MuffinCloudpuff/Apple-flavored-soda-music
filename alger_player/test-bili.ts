import BilibiliApi from 'qxr-bilibili-api';
(async () => {
    const api = new BilibiliApi();
    const res = await api.searchByType('test', 1);
    console.log(JSON.stringify(res.result[0], null, 2));
})();
