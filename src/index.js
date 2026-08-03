// ============================================================
// Vyron Community Worker - VERSI SIMPEL (broadcast relay saja, TANPA key/license system)
// Paste seluruh isi file ini ke Edit Code di dashboard Cloudflare (timpa semua yang lama)
//
// Environment Variables yang dibutuhkan (Settings -> Variables):
//   SECRET_KEY           -> harus sama persis dengan "Webhook Key" di script Lua
//   DISCORD_WEBHOOK_URL  -> URL webhook Discord channel kamu (buat broadcast relay)
//
// Gak ada KV binding, gak ada slash command, gak ada license check. Cuma nerima
// request dari script Lua dan nerusin jadi embed Discord.
// ============================================================

async function handleBroadcastRelay(request, env) {
	const url = new URL(request.url);
	const params = url.searchParams;

	const key = params.get("key");
	const SECRET_KEY = env.SECRET_KEY || "mY9xK2pQv81A7zNfL4RsWdE0HcB5";
	if (!key || key !== SECRET_KEY) {
		return new Response("Unauthorized", { status: 401 });
	}

	const DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL;
	if (!DISCORD_WEBHOOK_URL) {
		return new Response("Missing DISCORD_WEBHOOK_URL binding", { status: 500 });
	}

	const player = params.get("player") || "Unknown";
	const server = params.get("server") || "Unknown";
	const world = params.get("world") || "Unknown";
	const cmdType = params.get("type") || "-";
	const message = params.get("message") || "-";
	const progress = params.get("progress") || "-";
	const time = params.get("time") || "-";
	const discordId = params.get("discord_id") || "";

	const gemsRaw = params.get("gems") || "0";
	const gemsNum = Number(gemsRaw);
	const gems = Number.isFinite(gemsNum) ? gemsNum.toLocaleString("en-US") : gemsRaw;

	const fields = [
		{ name: "id gift Player id gift", value: player, inline: true },
		{ name: "id gift Server id gift", value: server, inline: true },
		{ name: "id gift World id gift", value: world, inline: true },
		{ name: "id gift Type id gift", value: cmdType, inline: true },
		{ name: "id gift Message id gift", value: message, inline: false },
		{ name: "id gift Progress id gift", value: progress, inline: true },
		{ name: "id gift Gems id gift", value: gems, inline: true },
		{ name: "id gift Time id gift", value: time, inline: true },
	];

	if (discordId) {
		fields.push({ name: "id gift Used by", value: `<@${discordId}>`, inline: false });
	}

	const embed = {
		title: "\uD83C\uDF81 \uD83D\uDCE2 Vyron Super Broadcast",
		color: 0x5865f2,
		thumbnail: { url: "https://cdn.discordapp.com/attachments/1431308287210553476/1533780095578407055/8925105b7a2ffc7a111b9b7275d89753.jpg?ex=6a71bb87&is=6a706a07&hm=02dde7d2eaa0ad285085a76c8208e725849198577906e4e1fe7761d47c31b3c0&" },
		image: { url: "https://cdn.discordapp.com/attachments/1426885065412968512/1532648232818184262/standard.gif?ex=6a6d9d65&is=6a6c4be5&hm=cdec30fddef3c5589141b9acecb3f947849e9fa3e11dc5a67e40f52b7133841a&" },
		fields,
		footer: { text: "Powered by Vyron Community" },
	};

	const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			embeds: [embed],
			allowed_mentions: { parse: [] },
		}),
	});

	return new Response(discordRes.ok ? "OK" : "Failed to send to Discord", {
		status: discordRes.ok ? 200 : 500,
	});
}

// ============================================================
// ROUTING UTAMA
// ============================================================
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/" || url.pathname === "") {
			return handleBroadcastRelay(request, env);
		}

		return new Response("Not found", { status: 404 });
	},
};
