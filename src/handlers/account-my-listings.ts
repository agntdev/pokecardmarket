import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "📋 My listings", data: "account:my_listings", order: 40 });
const composer = new Composer<Ctx>();

composer.callbackQuery("account:my_listings", async (ctx) => {
  await ctx.answerCallbackQuery();
  const listings = ctx.session.listings ?? [];
  const mine = listings.filter((x) => x.owner === ctx.from?.id);
  if (mine.length === 0) {
    await ctx.reply("No listings yet — tap ➕ Create listing to add your first card.", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create listing", "listing:create:start")], [inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }
  const text = mine.map((x) => `${String(x.title)} — ${String(x.currency)} ${String(x.price)} (${String(x.status)})`).join("\n");
  await ctx.reply(`Here are your listings:\n\n${text}`, { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) });
});

export default composer;
