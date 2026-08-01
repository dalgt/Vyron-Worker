// ============================================================
// Vyron Community Worker - GABUNGAN v4 (broadcast relay + license key bertier
// + /getkey publik dengan multi-gateway sfl.gl + /grantkey Permanent = Owner only)
// Paste seluruh isi file ini ke Edit Code di dashboard Cloudflare (timpa semua yang lama)
//
// Environment Variables yang dibutuhkan (Settings -> Variables):
//   SECRET_KEY           -> harus sama persis dengan "Webhook Key" di script Lua
//   DISCORD_WEBHOOK_URL  -> URL webhook Discord channel kamu (buat broadcast relay)
//   DISCORD_PUBLIC_KEY   -> dari Discord Developer Portal (buat verifikasi command)
//   ADMIN_ROLE_ID        -> Role ID yang boleh /grantkey tier free/1day/3day/7day
//   OWNER_ROLE_ID         -> Role ID yang boleh /grantkey tier Permanent (role owner
//                             otomatis boleh grant tier apa aja, termasuk yang admin bisa)
//   APPLICATION_ID       -> dari Discord Developer Portal
//   BOT_TOKEN            -> dari Discord Developer Portal (centang Encrypt)
//   SETUP_SECRET         -> Vyronkey22 (dipakai buat lock link daftar command)
//   SFL_API_KEY           -> API Token dari safelinku.com (Member > Tools > Api),
//                             dipakai buat nge-shrink tiap link gateway /getkey.
//                             Kalau kosong/API gagal, link mentah (gak di-shrink)
//                             dipakai sebagai fallback.
//
// KV Binding yang dibutuhkan (Settings -> Bindings):
//   LICENSES
//
// CATATAN soal SFL_API_KEY:
//   Format yang dipakai di bawah ini SUDAH dikonfirmasi dari dokumentasi resmi
//   SafelinkU (safelinku.com/member/tools/api): POST ke
//   https://safelinku.com/api/v1/links, header Authorization: Bearer <token>,
//   body JSON {"url": "..."}, respons {"url": "https://safelinku.com/xxxx"}.
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const STEP_TTL_SEC = 900; // tiap tahap gateway berlaku 15 menit sebelum harus mulai ulang

// tier -> durasi hari. null = permanen (gak pernah expired)
const TIER_DURATIONS = {
	free: 1,
	"1day": 1,
	"3day": 3,
	"7day": 7,
	permanent: null,
};

const TIER_LABELS = {
	free: "Free (1 hari)",
	"1day": "1 Hari",
	"3day": "3 Hari",
	"7day": "7 Hari",
	permanent: "Permanent",
};

// Tier yang boleh diambil lewat /getkey publik, dan berapa kali harus
// lewatin gateway sfl.gl buat tiap tier-nya sebelum key-nya aktif.
const GETKEY_STEPS = {
	"1day": 2,
	"3day": 5,
	"7day": 10,
};

function jsonResponse(obj, status = 200) {
	return new Response(JSON.stringify(obj), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function htmlResponse(html, status = 200) {
	return new Response(html, {
		status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function hexToBytes(hex) {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
	}
	return bytes;
}

function generateKey() {
	const seg = () =>
		Array.from({ length: 4 }, () =>
			"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 33)]
		).join("");
	return `VYRON-${seg()}-${seg()}`;
}

function generateToken() {
	return crypto.randomUUID().replace(/-/g, "");
}

// Progress bar teks sederhana, misal buildProgressBar(2,5) -> "â—â—â—‹â—‹â—‹ (2/5)"
function buildProgressBar(current, total) {
	const filled = "â—".repeat(Math.max(0, current));
	const empty = "â—‹".repeat(Math.max(0, total - current));
	return `${filled}${empty} (${current}/${total})`;
}

// ============================================================
// BAGIAN LAMA: Broadcast relay -> bikin embed Discord
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
		thumbnail: { url: "https://cdn.discordapp.com/attachments/1430379659341860988/1532689218630062222/8925105b7a2ffc7a111b9b7275d89753.jpg?ex=6a6dc391&is=6a6c7211&hm=743ee3e63551b6e1954e56ed3db225d11508fde415f4d17e3f1145717771be03&" },
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
// BAGIAN LICENSE
//   /getkey   -> publik/bebas, tier 1day/3day/7day, SEKALI seumur hidup per
//                Discord ID, harus lewatin sfl.gl SEBANYAK N kali (beda per
//                tier) sebelum key-nya aktif
//   /grantkey -> role-gated. Permanent CUMA OWNER_ROLE_ID. Tier lain (free/
//                1day/3day/7day) boleh ADMIN_ROLE_ID atau OWNER_ROLE_ID
//   /redeem   -> siapa aja yang punya key dari /grantkey buat aktivasi
// ============================================================

async function verifyDiscordRequest(request, env) {
	const signature = request.headers.get("x-signature-ed25519");
	const timestamp = request.headers.get("x-signature-timestamp");
	const body = await request.text();

	if (!signature || !timestamp) return { valid: false, body };

	try {
		const key = await crypto.subtle.importKey(
			"raw",
			hexToBytes(env.DISCORD_PUBLIC_KEY),
			{ name: "Ed25519" },
			false,
			["verify"]
		);
		const encoder = new TextEncoder();
		const isValid = await crypto.subtle.verify(
			"Ed25519",
			key,
			hexToBytes(signature),
			encoder.encode(timestamp + body)
		);
		return { valid: isValid, body };
	} catch (e) {
		return { valid: false, body, error: String(e) };
	}
}

// Shrink via SafelinkU REST API (POST https://safelinku.com/api/v1/links,
// Authorization: Bearer <token>, body: {"url": "..."}). Best-effort: kalau
// gagal / API key kosong, balikin URL aslinya apa adanya biar alurnya tetap
// jalan (cuma gak lewat gateway sfl.gl).
async function shrinkWithSfl(longUrl, env) {
	if (!env.SFL_API_KEY) return longUrl;
	try {
		const res = await fetch("https://safelinku.com/api/v1/links", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.SFL_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ url: longUrl }),
		});
		if (!res.ok) return longUrl;
		const data = await res.json();
		if (data && typeof data.url === "string" && data.url.startsWith("http")) {
			return data.url;
		}
		return longUrl;
	} catch (e) {
		return longUrl;
	}
}

async function sendDM(discordId, content, env) {
	try {
		const dmChannelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
			method: "POST",
			headers: {
				Authorization: `Bot ${env.BOT_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ recipient_id: discordId }),
		});
		if (!dmChannelRes.ok) return false;
		const dmChannel = await dmChannelRes.json();
		if (!dmChannel.id) return false;

		const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
			method: "POST",
			headers: {
				Authorization: `Bot ${env.BOT_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ content }),
		});
		return msgRes.ok;
	} catch (e) {
		return false;
	}
}

async function activateLicense(discordId, tier, env) {
	const durationDays = TIER_DURATIONS[tier];
	const now = Date.now();
	const expiresAt = durationDays === null ? null : now + durationDays * DAY_MS;

	await env.LICENSES.put(
		`license:${discordId}`,
		JSON.stringify({ active: true, tier, activatedAt: now, expiresAt })
	);

	return expiresAt;
}

function expiryText(expiresAt) {
	return expiresAt === null
		? "**Permanent** (gak pernah expired)"
		: `sampai <t:${Math.floor(expiresAt / 1000)}:F>`;
}

async function handleInteractions(request, env) {
	const { valid, body } = await verifyDiscordRequest(request, env);
	if (!valid) {
		return new Response("Bad request signature", { status: 401 });
	}

	const interaction = JSON.parse(body);

	if (interaction.type === 1) {
		return jsonResponse({ type: 1 });
	}

	if (interaction.type !== 2) {
		return jsonResponse({ type: 4, data: { content: "Unknown interaction." } });
	}

	const commandName = interaction.data.name;
	const options = interaction.data.options || [];
	const getOpt = (name) => options.find((o) => o.name === name)?.value;

	// ---- /getkey - BEBAS buat siapa aja, tier 1day/3day/7day, sekali seumur
	// ----           hidup, harus lewatin sfl.gl N kali sesuai tier ----
	if (commandName === "getkey") {
		const discordId = interaction.member?.user?.id;
		if (!discordId) {
			return jsonResponse({
				type: 4,
				data: { content: "Gak bisa baca Discord ID kamu, coba lagi.", flags: 64 },
			});
		}

		const tier = getOpt("tier");
		const totalSteps = GETKEY_STEPS[tier];
		if (!totalSteps) {
			return jsonResponse({
				type: 4,
				data: {
					content: "Tier gak valid buat /getkey. Cuma bisa 1 Hari / 3 Hari / 7 Hari lewat command ini - Permanent cuma bisa dikasih Owner.",
					flags: 64,
				},
			});
		}

		const alreadyUsed = await env.LICENSES.get(`getkey_used:${discordId}`);
		if (alreadyUsed) {
			return jsonResponse({
				type: 4,
				data: {
					content: "Kamu sudah pernah pakai `/getkey` sebelumnya (cuma boleh sekali seumur hidup). Kalau key kamu sudah expired, hubungi Owner buat beli **Permanent**.",
					flags: 64,
				},
			});
		}

		const token = generateToken();
		await env.LICENSES.put(
			`claim:${token}`,
			JSON.stringify({ discordId, tier, totalSteps, stepDone: 0, createdAt: Date.now() }),
			{ expirationTtl: STEP_TTL_SEC }
		);

		const origin = new URL(request.url).origin;
		const claimUrl = `${origin}/claim?token=${token}`;
		const finalLink = await shrinkWithSfl(claimUrl, env);

		return jsonResponse({
			type: 4,
			data: {
				content:
					`ðŸ”— Key **${TIER_LABELS[tier]}** kamu butuh **${totalSteps}x** lewatin halaman gateway berikut ini (tiap tahap link berlaku 15 menit, ikuti sampai selesai):\n${finalLink}\n\n` +
					`Progress: ${buildProgressBar(1, totalSteps)}\n\n` +
					`Setelah tahap terakhir selesai, license otomatis aktif ke akun Discord kamu dan bot bakal DM konfirmasinya. Ingat: ini cuma bisa dipakai **1x seumur hidup**.`,
				flags: 64,
			},
		});
	}

	// ---- /grantkey - Permanent CUMA OWNER_ROLE_ID. Tier lain boleh ADMIN atau OWNER ----
	if (commandName === "grantkey") {
		const member = interaction.member;
		const callerId = member?.user?.id;
		const roles = member?.roles || [];
		const isOwner = !!env.OWNER_ROLE_ID && roles.includes(env.OWNER_ROLE_ID);
		const isAdmin = !!env.ADMIN_ROLE_ID && roles.includes(env.ADMIN_ROLE_ID);

		if (!callerId || (!isOwner && !isAdmin)) {
			return jsonResponse({
				type: 4,
				data: { content: "Kamu gak punya akses buat command ini.", flags: 64 },
			});
		}

		const tier = getOpt("tier");
		if (!TIER_DURATIONS.hasOwnProperty(tier)) {
			return jsonResponse({
				type: 4,
				data: { content: "Tier gak valid.", flags: 64 },
			});
		}

		if (tier === "permanent" && !isOwner) {
			return jsonResponse({
				type: 4,
				data: { content: "Tier **Permanent** cuma bisa dikeluarkan Owner.", flags: 64 },
			});
		}

		const newKey = generateKey();
		await env.LICENSES.put(
			`key:${newKey}`,
			JSON.stringify({ tier, used: false, createdAt: Date.now(), createdBy: callerId })
		);

		return jsonResponse({
			type: 4,
			data: {
				content: `\uD83D\uDD11 Key baru (${TIER_LABELS[tier]}):\n\`${newKey}\`\n\nKasih ke pembeli, suruh mereka ketik \`/redeem key:${newKey}\` di sini.`,
				flags: 64,
			},
		});
	}

	// ---- /redeem - siapa aja yang punya key dari /grantkey ----
	if (commandName === "redeem") {
		const discordId = interaction.member?.user?.id;
		const inputKey = (getOpt("key") || "").trim().toUpperCase();

		if (!discordId || !inputKey) {
			return jsonResponse({
				type: 4,
				data: { content: "Key gak boleh kosong.", flags: 64 },
			});
		}

		const raw = await env.LICENSES.get(`key:${inputKey}`);
		if (!raw) {
			return jsonResponse({
				type: 4,
				data: { content: "Key gak ditemukan / salah ketik.", flags: 64 },
			});
		}

		const keyData = JSON.parse(raw);
		if (keyData.used) {
			return jsonResponse({
				type: 4,
				data: { content: "Key ini sudah pernah dipakai.", flags: 64 },
			});
		}

		const expiresAt = await activateLicense(discordId, keyData.tier, env);

		keyData.used = true;
		keyData.usedBy = discordId;
		keyData.usedAt = Date.now();
		await env.LICENSES.put(`key:${inputKey}`, JSON.stringify(keyData));

		return jsonResponse({
			type: 4,
			data: {
				content: `\u2705 License aktif! Tier: **${TIER_LABELS[keyData.tier]}**, ${expiryText(expiresAt)}.\nBuka modul script, pencet **Recheck License** kalau belum otomatis update.`,
				flags: 64,
			},
		});
	}

	return jsonResponse({ type: 4, data: { content: "Unknown command." } });
}

// ---- GET /claim?token=... - tiap tahap gateway sfl.gl mendarat di sini ----
async function handleClaim(url, env) {
	const token = url.searchParams.get("token");
	if (!token) {
		return htmlResponse("<h2>Link gak valid.</h2><p>Coba jalankan /getkey lagi di Discord.</p>", 400);
	}

	const raw = await env.LICENSES.get(`claim:${token}`);
	if (!raw) {
		return htmlResponse("<h2>Link sudah expired atau sudah pernah dipakai.</h2><p>Coba jalankan /getkey lagi di Discord buat dapat link baru dari awal.</p>", 400);
	}

	// Sekali pakai per tahap: hapus token ini segera supaya gak bisa di-refresh/dipakai ulang
	await env.LICENSES.delete(`claim:${token}`);

	const claimData = JSON.parse(raw);
	const { discordId, tier, totalSteps, stepDone } = claimData;
	const nextStepDone = stepDone + 1;

	// Belum tahap terakhir -> keluarkan link gateway berikutnya, jangan aktifkan dulu
	if (nextStepDone < totalSteps) {
		const nextToken = generateToken();
		await env.LICENSES.put(
			`claim:${nextToken}`,
			JSON.stringify({ discordId, tier, totalSteps, stepDone: nextStepDone, createdAt: Date.now() }),
			{ expirationTtl: STEP_TTL_SEC }
		);

		const origin = new URL(url.toString()).origin;
		const nextClaimUrl = `${origin}/claim?token=${nextToken}`;
		const nextLink = await shrinkWithSfl(nextClaimUrl, env);

		return htmlResponse(`
			<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
				<h2>Tahap ${nextStepDone} dari ${totalSteps} selesai âœ…</h2>
				<p>Lanjut ke tahap ${nextStepDone + 1} buat lanjutin proses ambil key ${TIER_LABELS[tier]} kamu.</p>
				<p><a href="${nextLink}" style="font-size:18px;">âž¡ Lanjut ke tahap ${nextStepDone + 1}</a></p>
				<p style="color:#888;font-size:13px;">Link ini berlaku 15 menit. Kalau expired, jalankan /getkey lagi dari awal.</p>
			</body></html>
		`);
	}

	// Tahap terakhir -> jaga-jaga race condition, aktifkan license, kirim DM
	const alreadyUsed = await env.LICENSES.get(`getkey_used:${discordId}`);
	if (alreadyUsed) {
		return htmlResponse("<h2>Kamu sudah pernah klaim /getkey sebelumnya.</h2><p>Hubungi Owner buat beli Permanent kalau key kamu sudah expired.</p>", 400);
	}

	const expiresAt = await activateLicense(discordId, tier, env);
	await env.LICENSES.put(`getkey_used:${discordId}`, "1"); // one-time flag, permanen, gak ada TTL

	const dmContent =
		`âœ… License kamu aktif! Tier: **${TIER_LABELS[tier]}**, ${expiryText(expiresAt)}.\n` +
		`Buka modul script Vyron SB, pencet **Recheck License** kalau belum otomatis kebuka.\n\n` +
		`Ingat: /getkey cuma bisa dipakai 1x seumur hidup. Kalau key ini nanti expired, hubungi Owner buat beli **Permanent**.`;
	const dmSent = await sendDM(discordId, dmContent, env);

	const dmNote = dmSent
		? "Key sudah dikirim juga lewat DM Discord kamu."
		: "Gagal kirim DM (mungkin DM kamu ditutup) - tapi license-nya sudah aktif kok, tinggal pencet Recheck License di script.";

	return htmlResponse(`
		<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
			<h2>âœ… Semua ${totalSteps} tahap selesai, key berhasil diaktifkan!</h2>
			<p>Tier: <b>${TIER_LABELS[tier]}</b></p>
			<p>${dmNote}</p>
			<p>Balik ke Discord / game, buka modul script, pencet <b>Recheck License</b>.</p>
		</body></html>
	`);
}

async function handleVerifyLicense(url, env) {
	const discordId = url.searchParams.get("discord_id");
	if (!discordId) return jsonResponse({ valid: false, reason: "no_discord_id" });

	const raw = await env.LICENSES.get(`license:${discordId}`);
	if (!raw) return jsonResponse({ valid: false, reason: "not_found" });

	const data = JSON.parse(raw);

	if (data.active === false) {
		return jsonResponse({ valid: false, reason: "revoked" });
	}

	if (data.expiresAt !== null && Date.now() > data.expiresAt) {
		return jsonResponse({ valid: false, reason: "expired" });
	}

	const daysLeft =
		data.expiresAt === null ? null : Math.ceil((data.expiresAt - Date.now()) / DAY_MS);

	return jsonResponse({ valid: true, tier: data.tier, days_left: daysLeft });
}

async function handleRegisterCommand(url, env) {
	if (url.searchParams.get("secret") !== env.SETUP_SECRET) {
		return new Response("Forbidden", { status: 403 });
	}

	const commands = [
		{
			name: "getkey",
			description: "Ambil key gratis (1/3/7 Hari) - cuma 1x seumur hidup, lewat beberapa gateway sfl.gl",
			type: 1,
			options: [
				{
					type: 3,
					name: "tier",
					description: "Tier key",
					required: true,
					choices: [
						{ name: "1 Hari (2x gateway)", value: "1day" },
						{ name: "3 Hari (5x gateway)", value: "3day" },
						{ name: "7 Hari (10x gateway)", value: "7day" },
					],
				},
			],
		},
		{
			name: "grantkey",
			description: "[Admin/Owner] Generate license key baru. Permanent cuma bisa Owner.",
			type: 1,
			options: [
				{
					type: 3,
					name: "tier",
					description: "Tier key",
					required: true,
					choices: [
						{ name: "Free (1 hari)", value: "free" },
						{ name: "1 Hari", value: "1day" },
						{ name: "3 Hari", value: "3day" },
						{ name: "7 Hari", value: "7day" },
						{ name: "Permanent (Owner only)", value: "permanent" },
					],
				},
			],
		},
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
		thumbnail: { url: "https://cdn.discordapp.com/attachments/1430379659341860988/1532689218630062222/8925105b7a2ffc7a111b9b7275d89753.jpg?ex=6a6dc391&is=6a6c7211&hm=743ee3e63551b6e1954e56ed3db225d11508fde415f4d17e3f1145717771be03&" },
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
// BAGIAN LICENSE
//   /getkey   -> publik/bebas, tier 1day/3day/7day, SEKALI seumur hidup per
//                Discord ID, harus lewatin sfl.gl SEBANYAK N kali (beda per
//                tier) sebelum key-nya aktif
//   /grantkey -> role-gated. Permanent CUMA OWNER_ROLE_ID. Tier lain (free/
//                1day/3day/7day) boleh ADMIN_ROLE_ID atau OWNER_ROLE_ID
//   /redeem   -> siapa aja yang punya key dari /grantkey buat aktivasi
// ============================================================

async function verifyDiscordRequest(request, env) {
	const signature = request.headers.get("x-signature-ed25519");
	const timestamp = request.headers.get("x-signature-timestamp");
	const body = await request.text();

	if (!signature || !timestamp) return { valid: false, body };

	try {
		const key = await crypto.subtle.importKey(
			"raw",
			hexToBytes(env.DISCORD_PUBLIC_KEY),
			{ name: "Ed25519" },
			false,
			["verify"]
		);
		const encoder = new TextEncoder();
		const isValid = await crypto.subtle.verify(
			"Ed25519",
			key,
			hexToBytes(signature),
			encoder.encode(timestamp + body)
		);
		return { valid: isValid, body };
	} catch (e) {
		return { valid: false, body, error: String(e) };
	}
}

// Best-effort shrink lewat sfl.gl. Kalau gagal / API key kosong, balikin URL
// aslinya apa adanya supaya alurnya tetap jalan (cuma gak lewat sfl.gl).
async function shrinkWithSfl(longUrl, env) {
	if (!env.SFL_API_KEY) return longUrl;
	try {
		const apiUrl =
			"https://sfl.gl/api?api=" + encodeURIComponent(env.SFL_API_KEY) +
			"&url=" + encodeURIComponent(longUrl) +
			"&format=text";
		const res = await fetch(apiUrl);
		if (!res.ok) return longUrl;
		const text = (await res.text()).trim();
		if (text && text.startsWith("http")) return text;
		return longUrl;
	} catch (e) {
		return longUrl;
	}
}

async function sendDM(discordId, content, env) {
	try {
		const dmChannelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
			method: "POST",
			headers: {
				Authorization: `Bot ${env.BOT_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ recipient_id: discordId }),
		});
		if (!dmChannelRes.ok) return false;
		const dmChannel = await dmChannelRes.json();
		if (!dmChannel.id) return false;

		const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
			method: "POST",
			headers: {
				Authorization: `Bot ${env.BOT_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ content }),
		});
		return msgRes.ok;
	} catch (e) {
		return false;
	}
}

async function activateLicense(discordId, tier, env) {
	const durationDays = TIER_DURATIONS[tier];
	const now = Date.now();
	const expiresAt = durationDays === null ? null : now + durationDays * DAY_MS;

	await env.LICENSES.put(
		`license:${discordId}`,
		JSON.stringify({ active: true, tier, activatedAt: now, expiresAt })
	);

	return expiresAt;
}

function expiryText(expiresAt) {
	return expiresAt === null
		? "**Permanent** (gak pernah expired)"
		: `sampai <t:${Math.floor(expiresAt / 1000)}:F>`;
}

async function handleInteractions(request, env) {
	const { valid, body } = await verifyDiscordRequest(request, env);
	if (!valid) {
		return new Response("Bad request signature", { status: 401 });
	}

	const interaction = JSON.parse(body);

	if (interaction.type === 1) {
		return jsonResponse({ type: 1 });
	}

	if (interaction.type !== 2) {
		return jsonResponse({ type: 4, data: { content: "Unknown interaction." } });
	}

	const commandName = interaction.data.name;
	const options = interaction.data.options || [];
	const getOpt = (name) => options.find((o) => o.name === name)?.value;

	// ---- /getkey - BEBAS buat siapa aja, tier 1day/3day/7day, sekali seumur
	// ----           hidup, harus lewatin sfl.gl N kali sesuai tier ----
	if (commandName === "getkey") {
		const discordId = interaction.member?.user?.id;
		if (!discordId) {
			return jsonResponse({
				type: 4,
				data: { content: "Gak bisa baca Discord ID kamu, coba lagi.", flags: 64 },
			});
		}

		const tier = getOpt("tier");
		const totalSteps = GETKEY_STEPS[tier];
		if (!totalSteps) {
			return jsonResponse({
				type: 4,
				data: {
					content: "Tier gak valid buat /getkey. Cuma bisa 1 Hari / 3 Hari / 7 Hari lewat command ini - Permanent cuma bisa dikasih Owner.",
					flags: 64,
				},
			});
		}

		const alreadyUsed = await env.LICENSES.get(`getkey_used:${discordId}`);
		if (alreadyUsed) {
			return jsonResponse({
				type: 4,
				data: {
					content: "Kamu sudah pernah pakai `/getkey` sebelumnya (cuma boleh sekali seumur hidup). Kalau key kamu sudah expired, hubungi Owner buat beli **Permanent**.",
					flags: 64,
				},
			});
		}

		const token = generateToken();
		await env.LICENSES.put(
			`claim:${token}`,
			JSON.stringify({ discordId, tier, totalSteps, stepDone: 0, createdAt: Date.now() }),
			{ expirationTtl: STEP_TTL_SEC }
		);

		const origin = new URL(request.url).origin;
		const claimUrl = `${origin}/claim?token=${token}`;
		const finalLink = await shrinkWithSfl(claimUrl, env);

		return jsonResponse({
			type: 4,
			data: {
				content:
					`🔗 Key **${TIER_LABELS[tier]}** kamu butuh **${totalSteps}x** lewatin halaman gateway berikut ini (tiap tahap link berlaku 15 menit, ikuti sampai selesai):\n${finalLink}\n\n` +
					`Progress: ${buildProgressBar(1, totalSteps)}\n\n` +
					`Setelah tahap terakhir selesai, license otomatis aktif ke akun Discord kamu dan bot bakal DM konfirmasinya. Ingat: ini cuma bisa dipakai **1x seumur hidup**.`,
				flags: 64,
			},
		});
	}

	// ---- /grantkey - Permanent CUMA OWNER_ROLE_ID. Tier lain boleh ADMIN atau OWNER ----
	if (commandName === "grantkey") {
		const member = interaction.member;
		const callerId = member?.user?.id;
		const roles = member?.roles || [];
		const isOwner = !!env.OWNER_ROLE_ID && roles.includes(env.OWNER_ROLE_ID);
		const isAdmin = !!env.ADMIN_ROLE_ID && roles.includes(env.ADMIN_ROLE_ID);

		if (!callerId || (!isOwner && !isAdmin)) {
			return jsonResponse({
				type: 4,
				data: { content: "Kamu gak punya akses buat command ini.", flags: 64 },
			});
		}

		const tier = getOpt("tier");
		if (!TIER_DURATIONS.hasOwnProperty(tier)) {
			return jsonResponse({
				type: 4,
				data: { content: "Tier gak valid.", flags: 64 },
			});
		}

		if (tier === "permanent" && !isOwner) {
			return jsonResponse({
				type: 4,
				data: { content: "Tier **Permanent** cuma bisa dikeluarkan Owner.", flags: 64 },
			});
		}

		const newKey = generateKey();
		await env.LICENSES.put(
			`key:${newKey}`,
			JSON.stringify({ tier, used: false, createdAt: Date.now(), createdBy: callerId })
		);

		return jsonResponse({
			type: 4,
			data: {
				content: `\uD83D\uDD11 Key baru (${TIER_LABELS[tier]}):\n\`${newKey}\`\n\nKasih ke pembeli, suruh mereka ketik \`/redeem key:${newKey}\` di sini.`,
				flags: 64,
			},
		});
	}

	// ---- /redeem - siapa aja yang punya key dari /grantkey ----
	if (commandName === "redeem") {
		const discordId = interaction.member?.user?.id;
		const inputKey = (getOpt("key") || "").trim().toUpperCase();

		if (!discordId || !inputKey) {
			return jsonResponse({
				type: 4,
				data: { content: "Key gak boleh kosong.", flags: 64 },
			});
		}

		const raw = await env.LICENSES.get(`key:${inputKey}`);
		if (!raw) {
			return jsonResponse({
				type: 4,
				data: { content: "Key gak ditemukan / salah ketik.", flags: 64 },
			});
		}

		const keyData = JSON.parse(raw);
		if (keyData.used) {
			return jsonResponse({
				type: 4,
				data: { content: "Key ini sudah pernah dipakai.", flags: 64 },
			});
		}

		const expiresAt = await activateLicense(discordId, keyData.tier, env);

		keyData.used = true;
		keyData.usedBy = discordId;
		keyData.usedAt = Date.now();
		await env.LICENSES.put(`key:${inputKey}`, JSON.stringify(keyData));

		return jsonResponse({
			type: 4,
			data: {
				content: `\u2705 License aktif! Tier: **${TIER_LABELS[keyData.tier]}**, ${expiryText(expiresAt)}.\nBuka modul script, pencet **Recheck License** kalau belum otomatis update.`,
				flags: 64,
			},
		});
	}

	return jsonResponse({ type: 4, data: { content: "Unknown command." } });
}

// ---- GET /claim?token=... - tiap tahap gateway sfl.gl mendarat di sini ----
async function handleClaim(url, env) {
	const token = url.searchParams.get("token");
	if (!token) {
		return htmlResponse("<h2>Link gak valid.</h2><p>Coba jalankan /getkey lagi di Discord.</p>", 400);
	}

	const raw = await env.LICENSES.get(`claim:${token}`);
	if (!raw) {
		return htmlResponse("<h2>Link sudah expired atau sudah pernah dipakai.</h2><p>Coba jalankan /getkey lagi di Discord buat dapat link baru dari awal.</p>", 400);
	}

	// Sekali pakai per tahap: hapus token ini segera supaya gak bisa di-refresh/dipakai ulang
	await env.LICENSES.delete(`claim:${token}`);

	const claimData = JSON.parse(raw);
	const { discordId, tier, totalSteps, stepDone } = claimData;
	const nextStepDone = stepDone + 1;

	// Belum tahap terakhir -> keluarkan link gateway berikutnya, jangan aktifkan dulu
	if (nextStepDone < totalSteps) {
		const nextToken = generateToken();
		await env.LICENSES.put(
			`claim:${nextToken}`,
			JSON.stringify({ discordId, tier, totalSteps, stepDone: nextStepDone, createdAt: Date.now() }),
			{ expirationTtl: STEP_TTL_SEC }
		);

		const origin = new URL(url.toString()).origin;
		const nextClaimUrl = `${origin}/claim?token=${nextToken}`;
		const nextLink = await shrinkWithSfl(nextClaimUrl, env);

		return htmlResponse(`
			<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
				<h2>Tahap ${nextStepDone} dari ${totalSteps} selesai ✅</h2>
				<p>Lanjut ke tahap ${nextStepDone + 1} buat lanjutin proses ambil key ${TIER_LABELS[tier]} kamu.</p>
				<p><a href="${nextLink}" style="font-size:18px;">➡ Lanjut ke tahap ${nextStepDone + 1}</a></p>
				<p style="color:#888;font-size:13px;">Link ini berlaku 15 menit. Kalau expired, jalankan /getkey lagi dari awal.</p>
			</body></html>
		`);
	}

	// Tahap terakhir -> jaga-jaga race condition, aktifkan license, kirim DM
	const alreadyUsed = await env.LICENSES.get(`getkey_used:${discordId}`);
	if (alreadyUsed) {
		return htmlResponse("<h2>Kamu sudah pernah klaim /getkey sebelumnya.</h2><p>Hubungi Owner buat beli Permanent kalau key kamu sudah expired.</p>", 400);
	}

	const expiresAt = await activateLicense(discordId, tier, env);
	await env.LICENSES.put(`getkey_used:${discordId}`, "1"); // one-time flag, permanen, gak ada TTL

	const dmContent =
		`✅ License kamu aktif! Tier: **${TIER_LABELS[tier]}**, ${expiryText(expiresAt)}.\n` +
		`Buka modul script Vyron SB, pencet **Recheck License** kalau belum otomatis kebuka.\n\n` +
		`Ingat: /getkey cuma bisa dipakai 1x seumur hidup. Kalau key ini nanti expired, hubungi Owner buat beli **Permanent**.`;
	const dmSent = await sendDM(discordId, dmContent, env);

	const dmNote = dmSent
		? "Key sudah dikirim juga lewat DM Discord kamu."
		: "Gagal kirim DM (mungkin DM kamu ditutup) - tapi license-nya sudah aktif kok, tinggal pencet Recheck License di script.";

	return htmlResponse(`
		<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
			<h2>✅ Semua ${totalSteps} tahap selesai, key berhasil diaktifkan!</h2>
			<p>Tier: <b>${TIER_LABELS[tier]}</b></p>
			<p>${dmNote}</p>
			<p>Balik ke Discord / game, buka modul script, pencet <b>Recheck License</b>.</p>
		</body></html>
	`);
}

async function handleVerifyLicense(url, env) {
	const discordId = url.searchParams.get("discord_id");
	if (!discordId) return jsonResponse({ valid: false, reason: "no_discord_id" });

	const raw = await env.LICENSES.get(`license:${discordId}`);
	if (!raw) return jsonResponse({ valid: false, reason: "not_found" });

	const data = JSON.parse(raw);

	if (data.active === false) {
		return jsonResponse({ valid: false, reason: "revoked" });
	}

	if (data.expiresAt !== null && Date.now() > data.expiresAt) {
		return jsonResponse({ valid: false, reason: "expired" });
	}

	const daysLeft =
		data.expiresAt === null ? null : Math.ceil((data.expiresAt - Date.now()) / DAY_MS);

	return jsonResponse({ valid: true, tier: data.tier, days_left: daysLeft });
}

async function handleRegisterCommand(url, env) {
	if (url.searchParams.get("secret") !== env.SETUP_SECRET) {
		return new Response("Forbidden", { status: 403 });
	}

	const commands = [
		{
			name: "getkey",
			description: "Ambil key gratis (1/3/7 Hari) - cuma 1x seumur hidup, lewat beberapa gateway sfl.gl",
			type: 1,
			options: [
				{
					type: 3,
					name: "tier",
					description: "Tier key",
					required: true,
					choices: [
						{ name: "1 Hari (2x gateway)", value: "1day" },
						{ name: "3 Hari (5x gateway)", value: "3day" },
						{ name: "7 Hari (10x gateway)", value: "7day" },
					],
				},
			],
		},
		{
			name: "grantkey",
			description: "[Admin/Owner] Generate license key baru. Permanent cuma bisa Owner.",
			type: 1,
			options: [
				{
					type: 3,
					name: "tier",
					description: "Tier key",
					required: true,
					choices: [
						{ name: "Free (1 hari)", value: "free" },
						{ name: "1 Hari", value: "1day" },
						{ name: "3 Hari", value: "3day" },
						{ name: "7 Hari", value: "7day" },
						{ name: "Permanent (Owner only)", value: "permanent" },
					],
				},
			],
		},
		{
			name: "redeem",
			description: "Tukar license key (dari /grantkey) buat aktivasi script",
			type: 1,
			options: [
				{
					type: 3,
					name: "key",
					description: "Key yang kamu punya",
					required: true,
				},
			],
		},
	];

	const res = await fetch(
		`https://discord.com/api/v10/applications/${env.APPLICATION_ID}/commands`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bot ${env.BOT_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(commands),
		}
	);

	const data = await res.json();
	return jsonResponse({ discord_response: data });
}

// ============================================================
// ROUTING UTAMA
// ============================================================
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/interactions" && request.method === "POST") {
			return handleInteractions(request, env);
		}

		if (url.pathname === "/verify") {
			return handleVerifyLicense(url, env);
		}

		if (url.pathname === "/claim") {
			return handleClaim(url, env);
		}

		if (url.pathname === "/register" || url.pathname === "/setup") {
			return handleRegisterCommand(url, env);
		}

		if (url.pathname === "/" || url.pathname === "") {
			return handleBroadcastRelay(request, env);
		}

		return new Response("Not found", { status: 404 });
	},
};
