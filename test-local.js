import fetch from "node-fetch";

async function run() {
  console.log("Fetching /api/bilibili/search?keyword=hello");
  const b = await fetch("http://localhost:3000/api/bilibili/search?keyword=hello");
  console.log("Bilibili OK?", b.ok, b.status, b.statusText);
  const bText = await b.text();
  console.log("Bilibili length:", bText.length, "start:", bText.substring(0, 30));

  console.log("\nFetching /api/netease/cloudsearch?keywords=hello");
  const n = await fetch("http://localhost:3000/api/netease/cloudsearch?keywords=hello");
  console.log("Netease OK?", n.ok, n.status, n.statusText);
  const nText = await n.text();
  console.log("Netease length:", nText.length, "start:", nText.substring(0, 30));
}

run();
