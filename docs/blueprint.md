# PokeCardMarket — Bot specification

**Archetype:** commerce

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram marketplace bot for collectors to list, browse, message about, and pay for Pokémon trading cards. Users create listings with up to 6 photos, buyers browse with filters and contact sellers through the bot (contact masked by default). The bot supports a monthly subscription model that unlocks messaging and premium placement, admin moderation notifications, and in-chat payments where available; shipping, escrow, and authenticity guarantees are out of scope.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual collectors
- casual sellers
- small resellers

## Success criteria

- Users can create and publish listings with photos and required metadata
- Buyers can discover listings with filters and paginated results
- Messaging inquiries are delivered to sellers with contact-masking preserved until seller opts to reveal
- Owners receive admin notifications for new subscriptions and flagged listings via ADMIN_CHAT_ID
- Subscription purchases complete via Telegram in-chat payments or fall back to owner-managed instructions

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and onboarding (explains free vs paid features, subscription CTA)
- **Create listing** (button, actor: user, callback: listing:create:start) — Begin guided listing creation form
  - inputs: title (text), card name / set (text), condition (picker), price (number), photos (up to 6 images), location (optional: geo or text), tags (optional)
  - outputs: draft listing saved, preview message with Confirm / Edit / Cancel buttons
- **Browse listings** (button, actor: user, callback: browse:start) — Open searchable, paginated listing browser
  - inputs: search text (slash search allowed), filters via buttons (set/name, condition, price range, nearby radius)
  - outputs: paginated result cards with photo, short details, and action buttons
- **My listings** (button, actor: user, callback: account:my_listings) — Manage, edit, or remove your published or draft listings
- **/help** (command, actor: user, command: /help) — Show help and guidance for flows and payments
- **Subscribe** (button, actor: user, callback: subscription:purchase) — Start subscription purchase flow to unlock messaging and premium placement
  - inputs: confirmation, payment via Telegram Payments (if available) or fallback instruction
  - outputs: receipt message, subscription record created, admin notification to ADMIN_CHAT_ID

## Flows

### Onboarding & subscription pitch
_Trigger:_ /start

1. Show welcome message describing free vs paid features in warm concise voice
2. Present primary buttons: Create listing, Browse listings, Subscribe, My listings
3. Provide 'Learn more' and /help fallback
4. If user taps Subscribe -> subscription purchase flow

_Data touched:_ User, Subscription

### Create listing (guided)
_Trigger:_ button: listing:create:start

1. Create a new draft listing and save session state
2. Collect title via ForceReply (slash commands allowed for pre-filled text)
3. Collect card details (name, set) as typed inputs
4. Ask for condition via inline keyboard (Mint / Near Mint / Played)
5. Collect price with validation (numeric, currency shown)
6. Collect up to 6 photos: accept images, validate type/size, provide progress and ability to skip when none
7. Optional: request location via 'Share location' button or typed city
8. Show preview of listing with photos and action buttons: Confirm Publish, Edit, Cancel
9. On Confirm -> publish listing, notify subscribed premium placement logic and optionally notify admin
10. Save listing persistently and notify creator with link and editing controls

_Data touched:_ Listing, Photo, User

### Browse listings
_Trigger:_ button: browse:start or /search query

1. Show filter toolbar as inline buttons (Name/Set, Condition, Price range, Nearby)
2. Accept typed search queries via slash or ForceReply
3. Return paginated result cards (photo thumbnail, title, price, condition, short location)
4. Each card includes inline buttons: View, Message seller, Make offer, Buy now (if enabled)
5. Support pagination via 'Next'/'Prev' callback buttons

_Data touched:_ Listing, User

### Message inquiry (buyer -> seller)
_Trigger:_ button: Message seller on a listing

1. If buyer is not subscribed and messaging requires subscription, prompt purchase
2. Collect message text via ForceReply
3. Create Conversation/Inquiry record and forward message to seller with listing context and 'Reply via bot' inline button
4. Seller reply goes through bot; bot forwards seller messages to buyer. Phone numbers remain masked in forwarded messages
5. Provide seller an explicit 'Reveal contact' action which only reveals contact to buyer if seller taps it

_Data touched:_ Conversation, User, Listing

### Subscription purchase
_Trigger:_ button: subscription:purchase

1. Show subscription terms and price (value provided from required_env)
2. Start Telegram Payments checkout if PAYMENT_PROVIDER_TOKEN is configured and available
3. On successful payment -> create Subscription record, send receipt to user, notify ADMIN_CHAT_ID
4. If payments unavailable -> show owner-managed fallback instructions and message admin to confirm external payment
5. Unlock messaging and premium listing placement for subscriber

_Data touched:_ Subscription, Transaction, User

### Buy now / purchase flow
_Trigger:_ button: Buy now on a listing

1. Show purchase summary and seller-provided delivery options (if any)
2. Initiate payment via Telegram Payments if configured; otherwise show instructions to contact owner/seller
3. On success -> create Transaction record, mark listing as pending/sold (owner controls final state), send receipts to both parties, optionally reveal contact per seller preference
4. Store transaction with payment status and timestamps

_Data touched:_ Transaction, Listing, User

### Flag / moderation flow
_Trigger:_ button: Flag listing or complaint action

1. Collect flag reason via inline set or free-text ForceReply
2. Create a moderation ticket and send notification with listing snapshot to ADMIN_CHAT_ID
3. Owner reviews and can take actions via admin controls: keep, hide, remove, or ban user
4. Report outcome to reporter (optional) and record moderation action

_Data touched:_ Listing, User, ModerationTicket

### Admin review & actions
_Trigger:_ admin notification via ADMIN_CHAT_ID

1. Admin receives message with listing, photos, and actions as inline buttons (Remove, Hide, Contact user, Ban)
2. Admin action updates persistent state and optionally notifies seller and reporter
3. All admin actions are logged to persistent audit records

_Data touched:_ Listing, User, ModerationTicket

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat id where admin notifications (new subscriptions, flagged listings) are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.
- **PAYMENT_PROVIDER_TOKEN** — Payment provider token for Telegram Payments (leave empty to use owner-managed fallback)
  - may be UNSET at runtime: the bot must still start, and the feature needing PAYMENT_PROVIDER_TOKEN must say so plainly instead of failing.
- **SUBSCRIPTION_MONTHLY_PRICE_CENTS** — Monthly subscription price in cents (bot displays this amount to users)
  - may be UNSET at runtime: the bot must still start, and the feature needing SUBSCRIPTION_MONTHLY_PRICE_CENTS must say so plainly instead of failing.
- **CURRENCY** — Three-letter currency code used for prices (e.g., USD)
  - may be UNSET at runtime: the bot must still start, and the feature needing CURRENCY must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User** _(retention: persistent)_ — Registered Telegram user of the bot, buyer or seller with profile and subscription state
  - fields: telegram_id, display_name, username, contact_shared (bool), subscription_status (active/expired/none), created_at, last_active_at, banned (bool)
- **Listing** _(retention: persistent)_ — A marketplace entry describing a Pokémon card for sale or trade
  - fields: listing_id, owner_user_id, title, card_name, set, condition, price_cents, currency, photo_ids, location (geo or text), tags, status (draft/published/pending/sold/hidden/removed), created_at, updated_at
- **Photo** _(retention: persistent)_ — Image asset uploaded with a listing
  - fields: photo_id, uploader_user_id, file_id (Telegram), mime_type, size_bytes, uploaded_at
- **Conversation** _(retention: persistent)_ — In-bot inquiry and message thread between buyer and seller
  - fields: conversation_id, listing_id, buyer_user_id, seller_user_id, messages (ordered list of message objects with sender, text, attachments, timestamp), contact_revealed (bool), created_at
- **Transaction** _(retention: persistent)_ — Record of a payment attempt or completed payment (subscription or buy-now)
  - fields: transaction_id, user_id, type (subscription|purchase|fee), amount_cents, currency, status (pending|completed|failed|refunded), payment_provider_id, created_at, metadata
- **ModerationTicket** _(retention: persistent)_ — Flag or report created by a user for admin review
  - fields: ticket_id, reporter_user_id, listing_id, reason, admin_action, status, created_at, resolved_at
- **Subscription** _(retention: persistent)_ — Paid subscription unlocking messaging and premium features
  - fields: subscription_id, user_id, plan (monthly), price_cents, currency, starts_at, expires_at, status

## Integrations

- **Telegram** (required) — Bot API messaging, inline keyboards, file storage references, and user identity
- **Telegram Payments** (required) — In-chat payments via provider token to accept subscription and purchase payments where available
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set/adjust subscription price and currency
- Review flagged listings and take actions (hide/remove/ban)
- Manually mark listings sold or change listing status
- Enable/disable Telegram Payments and toggle owner-managed fallback instructions
- Export listings and transactions for owner records
- Send broadcast/admin messages to subscribed users (opt-in required)
- Suspend or ban problematic users
- Configure maximum photos per listing and allowed file size limits

## Notifications

- Admin receives a notification when a new subscription is purchased (to ADMIN_CHAT_ID)
- Admin receives a notification when a listing is flagged with a link and listing snapshot
- Seller receives message notifications for new inquiries and replies
- Buyer receives receipts for payments and updates to transaction status
- Listing owner receives confirmation when listing is published, edited, or removed

## Permissions & privacy

- Phone numbers and contact details are masked by default; seller must explicitly 'Reveal contact' to share
- Photos and listing data are stored persistently until owner deletes them
- Payment receipts contain minimal metadata and are stored as Transaction records
- Users may request removal of their data; owner has controls to delete listings and related records
- The bot requests permission to access messages and media only as needed for listing creation and messaging

## Edge cases

- Payments unavailable in user's region or PAYMENT_PROVIDER_TOKEN misconfigured -> fallback to owner-managed instructions shown and admin notified
- Photo upload fails or a user sends more than 6 photos -> validate and reject extras with clear error message
- Duplicate listings or spam submissions -> rate-limit listing creation and surface 'report spam' option to admin
- Seller goes offline after buyer pays -> transaction stays recorded; bot does not enforce shipping or escrow (owner must manage disputes manually)
- User deletes their Telegram account -> bot retains listing per persistence policy until owner deletes or admin action
- Currency mismatch between buyer and listing -> show price converted only as informational text (no automatic FX) and record original currency
- Admins not available to review flags -> flags queue in persistent moderation tickets until addressed
- Large file uploads exceed platform limits -> reject with a clear size-limit error and guidance to retry

## Required tests

- Onboarding acceptance: /start shows menu, subscription CTA, and buttons function
- Create listing dialog-level happy path: collect title, card details, condition, price, up to 6 photos, optional location, preview, confirm publishes and persists listing
- Browse and filter acceptance: search by name/set, condition filter, price range, location radius, and correct pagination using callbacks
- Messaging acceptance: buyer sends inquiry -> seller receives forwarded message with listing context and reply round-trip works, verify contact remains masked until reveal
- Subscription payment test: successful Telegram Payments checkout creates Subscription and Transaction records and notifies ADMIN_CHAT_ID
- Payments fallback test: when PAYMENT_PROVIDER_TOKEN empty or payment fails, fallback instructions are shown and admin is notified
- Flagging & moderation test: user flags listing -> admin receives ticket with listing snapshot and admin actions update listing state
- Edge case tests: photo over-limit rejected, simultaneous edits handled correctly, and banned user cannot create listings

## Assumptions

- Bot name is PokeCardMarket as provided
- Default paid model is monthly subscription to unlock messaging and premium placement
- Photos limited to 6 per listing; size limits and exact max bytes to be defined by owner or platform defaults
- Contact privacy is masked by default; reveal is manual by seller
- No escrow, shipping, or authenticity verification features are provided by the bot
- Owner will provide ADMIN_CHAT_ID and desired subscription price/currency; payments will use Telegram Payments provider token if available
