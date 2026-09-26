import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { now } from "../domain-time.js";

registerMainMenuItem({ label: "⭐ Subscribe", data: "subscription:purchase", order: 30 });
const composer = new Composer<Ctx>();
type EnvCtx = Ctx & { env?: Record<string, unknown> };
const envValue = (ctx: EnvCtx, key: string) => String(ctx.env?.[key] ?? (typeof process !== "undefined" ? process.env[key] ?? "" : ""));

composer.callbackQuery("subscription:purchase", async (ctx) => {
  await ctx.answerCallbackQuery();
  const price = envValue(ctx, "SUBSCRIPTION_MONTHLY_PRICE_CENTS");
  const currency = envValue(ctx, "CURRENCY");
  if (!price || !currency) { await ctx.reply("Subscriptions aren't set up yet. The owner can add the monthly price and currency.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) }); return; }
  await ctx.reply(`Subscribe for ${currency} ${(Number(price) / 100).toFixed(2)} per month. Messaging and premium placement are included.`, { reply_markup: inlineKeyboard([[inlineButton("Confirm subscription", "subscription:confirm")], [inlineButton("⬅️ Back to menu", "menu:main")]]) });
});
composer.callbackQuery("subscription:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const price = envValue(ctx as unknown as EnvCtx, "SUBSCRIPTION_MONTHLY_PRICE_CENTS"); const currency = envValue(ctx as unknown as EnvCtx, "CURRENCY");
  if (!price || !currency) { await ctx.reply("Subscriptions aren't set up yet. Try again after the owner configures payments."); return; }
  const token = envValue(ctx, "PAYMENT_PROVIDER_TOKEN");
  if (token) {
    await ctx.api.sendInvoice(ctx.chat!.id, "PokeCardMarket monthly", "Message sellers and get premium placement.", `subscription:${ctx.from?.id}:${now()}`, currency, [{ label: "Monthly subscription", amount: Number(price) }], { provider_token: token });
    return;
  }
  const admin = adminChatId(ctx as unknown as { env?: Record<string, unknown> });
  if (admin) await ctx.api.sendMessage(admin, `Subscription request from ${ctx.from?.id}. Confirm the external payment when received.`).catch(() => undefined);
  await ctx.reply("Telegram payment isn't available right now. Message the owner to arrange payment, and they'll activate your subscription.");
});
composer.on("pre_checkout_query", async (ctx) => { await ctx.answerPreCheckoutQuery(true); });
composer.on("message:successful_payment", async (ctx, next) => {
  const payment = ctx.message.successful_payment;
  if (!payment.invoice_payload.startsWith("subscription:")) return next();
  const list = ctx.session.subscriptions ?? []; list.push({ id: `${ctx.from?.id}-${now()}`, user: ctx.from?.id, status: "active", provider: payment.telegram_payment_charge_id }); ctx.session.subscriptions = list;
  const tx = ctx.session.transactions ?? []; tx.push({ type: "subscription", user: ctx.from?.id, status: "completed", provider: payment.telegram_payment_charge_id }); ctx.session.transactions = tx;
  const admin = adminChatId(ctx as unknown as { env?: Record<string, unknown> }); if (admin) await ctx.api.sendMessage(admin, `New subscription payment received from ${ctx.from?.id}.`).catch(() => undefined);
  await ctx.reply("Your subscription is active — you can now message sellers and get premium placement.");
});
export default composer;
