import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now, recordId } from "../domain-time.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "➕ Create listing", data: "listing:create:start", order: 10 });
const composer = new Composer<Ctx>();
const force = (placeholder: string) => ({ force_reply: true as const, input_field_placeholder: placeholder });
const currencyFor = (ctx: Ctx) => String((ctx as Ctx & { env?: Record<string, unknown> }).env?.CURRENCY ?? (typeof process !== "undefined" ? process.env.CURRENCY ?? "" : ""));

function reset(ctx: Ctx) { ctx.session.step = undefined; ctx.session.draft = undefined; }
function preview(ctx: Ctx) {
  const d = ctx.session.draft ?? {};
  return `Preview\n\n${String(d.title)}\n${String(d.card)} · ${String(d.set)}\n${String(d.condition)} · ${String(d.currency)} ${String(d.price)}${d.location ? `\n${String(d.location)}` : ""}\nPhotos: ${String((d.photos as string[] | undefined)?.length ?? 0)}`;
}

composer.callbackQuery("listing:create:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.session.banned) { await ctx.reply("You can't create listings because this account is suspended."); return; }
  const listings = ctx.session.listings ?? [];
  const active = listings.some((x) => x.owner === ctx.from?.id && x.status === "draft");
  if (active) { await ctx.reply("You already have a draft open. Finish it or tap Cancel before starting another."); return; }
  ctx.session.draft = { id: recordId("listing", ctx.from?.id), owner: ctx.from?.id, photos: [], createdAt: now() };
  ctx.session.step = "listing_title";
  await ctx.reply("What should buyers call this listing?", { reply_markup: force("Card title") });
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step; const text = ctx.message.text.trim();
  if (!step?.startsWith("listing_")) return next();
  const d = ctx.session.draft ?? {};
  if (step === "listing_title") { if (text.length < 2) { await ctx.reply("That title is too short — try a little more detail.", { reply_markup: force("Card title") }); return; } d.title = text; ctx.session.step = "listing_card"; await ctx.reply("What card name and set is it from? Send them like: Charizard — Base Set", { reply_markup: force("Card and set") }); return; }
  if (step === "listing_card") { const parts = text.split("—").map((x) => x.trim()); d.card = parts[0]; d.set = parts.slice(1).join(" — ") || "Not specified"; ctx.session.step = "listing_condition"; await ctx.reply("How would you describe its condition?", { reply_markup: inlineKeyboard([[inlineButton("Mint", "listing:condition:mint"), inlineButton("Near Mint", "listing:condition:near")], [inlineButton("Played", "listing:condition:played")]]) }); return; }
  if (step === "listing_price") { const amount = Number(text.replace(",", ".")); if (!Number.isFinite(amount) || amount <= 0) { await ctx.reply("Enter a price greater than zero, like 24.50.", { reply_markup: force("Price") }); return; } const currency = currencyFor(ctx); if (!currency) { await ctx.reply("Currency isn't set up yet, so listings can't be published right now."); return; } d.price = amount.toFixed(2); d.currency = currency; ctx.session.step = "listing_photos"; await ctx.reply("Send up to 6 card photos, or tap Skip photos.", { reply_markup: inlineKeyboard([[inlineButton("Skip photos", "listing:photos:skip")]]) }); return; }
  if (step === "listing_location") { d.location = text; ctx.session.step = "listing_preview"; await ctx.reply(preview(ctx), { reply_markup: inlineKeyboard([[inlineButton("✅ Publish", "listing:publish"), inlineButton("Edit", "listing:edit")], [inlineButton("Cancel", "listing:cancel")]]) }); return; }
  if (step === "listing_tags") { d.tags = text; ctx.session.step = "listing_location"; await ctx.reply("Where is this card located? Send a city, or tap Skip location.", { reply_markup: inlineKeyboard([[inlineButton("Skip location", "listing:location:skip")]]) }); return; }
  return next();
});

composer.callbackQuery(/^listing:condition:(mint|near|played)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.draft = { ...(ctx.session.draft ?? {}), condition: ctx.match[1] === "near" ? "Near Mint" : ctx.match[1] === "mint" ? "Mint" : "Played" }; ctx.session.step = "listing_price"; await ctx.reply("What price should buyers see?", { reply_markup: force("Price") }); });
composer.on("message:photo", async (ctx) => {
  if (ctx.session.step !== "listing_photos") return;
  const photos = (ctx.session.draft?.photos as string[] | undefined) ?? [];
  if (photos.length >= 6) { await ctx.reply("You can add up to 6 photos. Tap Continue when you're ready."); return; }
  const photo = ctx.message.photo.at(-1); if (!photo) return;
  photos.push(photo.file_id); ctx.session.draft = { ...(ctx.session.draft ?? {}), photos };
  await ctx.reply(`${photos.length} of 6 photos saved. Add another or continue.`, { reply_markup: inlineKeyboard([[inlineButton("Continue", "listing:photos:done")]]) });
});
composer.callbackQuery("listing:photos:skip", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "listing_tags"; await ctx.reply("Any tags to help buyers find it? Send tags, or type none.", { reply_markup: force("Tags or none") }); });
composer.callbackQuery("listing:photos:done", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "listing_tags"; await ctx.reply("Any tags to help buyers find it? Send tags, or type none.", { reply_markup: force("Tags or none") }); });
composer.callbackQuery("listing:location:skip", async (ctx) => { await ctx.answerCallbackQuery(); delete ctx.session.draft?.location; ctx.session.step = "listing_preview"; await ctx.reply(preview(ctx), { reply_markup: inlineKeyboard([[inlineButton("✅ Publish", "listing:publish"), inlineButton("Edit", "listing:edit")], [inlineButton("Cancel", "listing:cancel")]]) }); });
composer.callbackQuery("listing:publish", async (ctx) => { await ctx.answerCallbackQuery(); const d = ctx.session.draft; if (!d) { await ctx.reply("That draft has expired — tap Create listing to start again."); return; } const listings = ctx.session.listings ?? []; listings.push({ ...d, status: "published", updatedAt: now() }); ctx.session.listings = listings; reset(ctx); await ctx.reply("Your listing is live. Buyers can now find it in Browse listings.", { reply_markup: inlineKeyboard([[inlineButton("View listings", "account:my_listings")], [inlineButton("Back to menu", "menu:main")]]) }); });
composer.callbackQuery("listing:cancel", async (ctx) => { await ctx.answerCallbackQuery(); reset(ctx); await ctx.reply("Draft cancelled. Nothing was published.", { reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) }); });
composer.callbackQuery("listing:edit", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "listing_title"; await ctx.reply("Let's edit it. What should buyers call this listing?", { reply_markup: force("Card title") }); });
export default composer;
