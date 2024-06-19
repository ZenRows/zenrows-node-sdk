import { ZenRows } from "./src";

const client = new ZenRows("30b6e918583973105813d23bcb5d2918f2a5025a", {
	retries: 2,
});

const res = await client.get("https://httpbin.org/status/503", {});

console.log(await res.text());
