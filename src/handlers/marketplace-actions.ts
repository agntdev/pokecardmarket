import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { now, recordId } from "../domain-time.js";

const composer = new Composer<Ctx>();
type EnvCtx = Ctx & { env?: Record<string, unknown> };
const setting = (ctx: EnvCtx, key: string) => String(ctx.env?.[key] ?? (typeof process !== "undefined" ? process.env[key] ?? "" : ""));
const listingFor = (ctx: Ctx, id: string) => (ctx.session.listings ?? []).find((x) => String(x.id) === id);

composer.callbackQuery(/^inquiry:start:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const active = (ctx.session.subscriptions ?? []).some((x) => x.user === ctx.from?.id && x.status === "active");
  if (!active) { await ctx.reply("Messaging sellers is part of the subscription. Tap Subscribe to unlock it.", { reply_markup: inlineKeyboard([[inlineButton("⭐ Subscribe", "subscription:purchase")]]) }); return; }
  if (!listingFor(ctx, ctx.match[1])) { await ctx.reply("That listing is no longer available."); return; }
  ctx.session.step = `inquiry:${ctx.match[1]}`;
  await ctx.reply("What would you like to ask the seller?", { reply_markup: { force_reply: true, input_field_placeholder: "Your message" } });
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step ?? "";
  if (!step.startsWith("inquiry:")) return next();
  const listing = listingFor(ctx, step.slice(9)); ctx.session.step = undefined;
  if (!listing) { await ctx.reply("That listing is no longer available."); return; }
  const text = ctx.message.text.trim();
  if (!text) { await ctx.reply("Send a short message to the seller."); return; }
  const messages = ctx.session.conversations ?? [];
  messages.push({ id: recordId("conversation", ctx.from?.id), listing: listing.id, buyer: ctx.from?.id, seller: listing.owner, contactRevealed: false, messages: [{ sender: ctx.from?.id, text, at: now() }] });
  ctx.session.conversations = messages;
  if (listing.owner && listing.owner !== ctx.from?.id) await ctx.api.sendMessage(Number(listing.owner), `New question about ${String(listing.title)}:\n\n${text}\n\nYour contact stays private. Reply through PokeCardMarket.`).catch(() => undefined);
  await ctx.reply("Your message is on its way. The seller can reply through the bot.");
});

composer.callbackQuery(/^inquiry:reveal:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const conversation = (ctx.session.conversations ?? []).find((x) => String(x.id) === ctx.match[1]);
  if (!conversation || conversation.seller !== ctx.from?.id) { await ctx.reply("Only the seller can reveal contact details."); return; }
  conversation.contactRevealed = true;
  await ctx.reply("Contact sharing is enabled for this conversation. Share your details in your next reply.");
});

composer.callbackQuery(/^purchase:start:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const listing = listingFor(ctx, ctx.match[1]);
  if (!listing) { await ctx.reply("That listing is no longer available."); return; }
  const env = ctx as unknown as EnvCtx;
  const token = setting(env, "PAYMENT_PROVIDER_TOKEN");
  const currency = String(listing.currency ?? setting(env, "CURRENCY"));
  if (!token) { await ctx.reply(`This card is ${currency} ${String(listing.price)}. Telegram payment isn't available, so contact the seller through a subscription to arrange payment.`, { reply_markup: inlineKeyboard([[inlineButton("⭐ Subscribe", "subscription:purchase")]]) }); return; }
  await ctx.api.sendInvoice(ctx.chat!.id, String(listing.title), "Pokémon card purchase", `purchase:${String(listing.id)}`, currency, [{ label: String(listing.title), amount: Math.round(Number(listing.price) * 100) }], { provider_token: token });
});
composer.on("message:successful_payment", async (ctx, next) => {
  if (!ctx.message.successful_payment.invoice_payload.startsWith("purchase:")) return next();
  const transactions = ctx.session.transactions ?? [];
  transactions.push({ id: recordId("transaction", ctx.from?.id), type: "purchase", status: "completed", provider: ctx.message.successful_payment.telegram_payment_charge_id, at: now() });
  ctx.session.transactions = transactions;
  await ctx.reply("Payment received. The seller will arrange delivery with you. Shipping and escrow aren't handled by this bot.");
});

composer.callbackQuery(/^flag:start:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = `flag:${ctx.match[1]}`; await ctx.reply("What should the owner know about this listing?", { reply_markup: { force_reply: true, input_field_placeholder: "Reason for report" } }); });
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step ?? "";
  if (!step.startsWith("flag:")) return next();
  const listing = listingFor(ctx, step.slice(5)); ctx.session.step = undefined;
  if (!listing) { await ctx.reply("That listing is no longer available."); return; }
  const ticket = { id: recordId("ticket", ctx.from?.id), reporter: ctx.from?.id, listing: listing.id, reason: ctx.message.text.trim(), status: "open", createdAt: now() };
  const tickets = ctx.session.moderation ?? []; tickets.push(ticket); ctx.session.moderation = tickets;
  const admin = adminChatId(ctx as unknown as { env?: Record<string, unknown> });
  if (admin) await ctx.api.sendMessage(admin, `Listing report\n${String(listing.title)}\nReason: ${ticket.reason}`, { reply_markup: inlineKeyboard([[inlineButton("Keep", `admin:keep:${ticket.id}`), inlineButton("Hide", `admin:hide:${ticket.id}`)], [inlineButton("Remove", `admin:remove:${ticket.id}`), inlineButton("Ban user", `admin:ban:${ticket.id}`)]]) }).catch(() => undefined);
  await ctx.reply(admin ? "Thanks — the owner has the report and will review it." : "Thanks — your report is queued for the owner to review.");
});

composer.callbackQuery(/^admin:(keep|hide|remove|ban):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx as never))) return;
  const ticket = (ctx.session.moderation ?? []).find((x) => String(x.id) === ctx.match[2]);
  if (!ticket) { await ctx.reply("That report is no longer available."); return; }
  ticket.status = "resolved"; ticket.action = ctx.match[1];
  const listing = listingFor(ctx, String(ticket.listing)); if (listing && ["hide", "remove"].includes(ctx.match[1])) listing.status = ctx.match[1] === "hide" ? "hidden" : "removed";
  await ctx.reply(`Report reviewed: ${ctx.match[1]}.`);
});

export default composer;
