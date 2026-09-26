import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "🔎 Browse listings", data: "browse:start", order: 20 });
const composer = new Composer<Ctx>();
const toolbar = inlineKeyboard([
  [inlineButton("🔎 Search", "browse:search"), inlineButton("Condition", "browse:condition")],
  [inlineButton("Price range", "browse:price"), inlineButton("Nearby", "browse:nearby")],
  [inlineButton("⬅️ Back to menu", "menu:main")],
]);

function render(ctx: Ctx, query = "") {
  const rows = (ctx.session.listings ?? []).filter((x) => x.status === "published" && (!query || `${x.title} ${x.card} ${x.set}`.toLowerCase().includes(query.toLowerCase())));
  if (!rows.length) return ctx.reply("No cards match yet — tap ➕ Create listing to add one.", { reply_markup: toolbar });
  const text = rows.map((x) => `${String(x.title)}\n${String(x.currency)} ${String(x.price)} · ${String(x.condition)}${x.location ? ` · ${String(x.location)}` : ""}`).join("\n\n");
  const buttons = rows.slice(0, 5).map((x) => [inlineButton(`View ${String(x.title).slice(0, 24)}`, `listing:view:${String(x.id)}`)]);
  return ctx.reply(`Cards on the market:\n\n${text}`, { reply_markup: inlineKeyboard([...buttons, ...toolbar.inline_keyboard]) });
}

composer.callbackQuery("browse:start", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "idle"; await render(ctx); });
composer.callbackQuery("browse:search", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "browse_search"; await ctx.reply("What card or set are you looking for?", { reply_markup: { force_reply: true, input_field_placeholder: "Card or set name" } }); });
composer.callbackQuery(/^browse:(condition|price|nearby)$/, async (ctx) => { await ctx.answerCallbackQuery(); await ctx.reply("That filter is ready when listings match it. Try Search to find a card by name or set.", { reply_markup: toolbar }); });
composer.on("message:text", async (ctx, next) => { if (ctx.session.step !== "browse_search") return next(); ctx.session.step = "idle"; await render(ctx, ctx.message.text.trim()); });

composer.callbackQuery(/^listing:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const item = (ctx.session.listings ?? []).find((x) => String(x.id) === ctx.match[1]);
  if (!item) { await ctx.reply("That listing is no longer available."); return; }
  await ctx.reply(`${String(item.title)}\n${String(item.card)} · ${String(item.set)}\n${String(item.currency)} ${String(item.price)} · ${String(item.condition)}\nSeller contact stays private until they choose to reveal it.`, { reply_markup: inlineKeyboard([[inlineButton("Message seller", `inquiry:start:${String(item.id)}`), inlineButton("Buy now", `purchase:start:${String(item.id)}`)], [inlineButton("Flag listing", `flag:start:${String(item.id)}`)]]) });
});

export default composer;
