# Ch.1 Release Day Strategy Memo

**Date:** 2026-03-04
**Bandcamp Friday:** 2026-03-06 (2 days out)
**Author:** Team Simonoto (overnight research)
**Status:** Draft for Simon's review

---

## Context

The ch1 site at simonoto.com/ch1/ is fully built: hub page with discovery mechanic, 4 track pages with audio-reactive visualizers, buy page with 3 Stripe tiers, EPK/press page, and post-purchase thank you page. Bandcamp Friday is March 6. This memo covers: release day site experience, social media strategy, fan list engagement, and last-minute site fixes.

---

## 1. Release Day Site Experience

### The Flow

A first-time visitor on release day should experience this:

```
Instagram/TikTok post → simonoto.com/ch1/ (hub page) → explore tracks → buy page → purchase → thank you page
```

### Hub Page (ch1/index.html) — Changes for Release Day

**Current state:** The hub page shows 4 track cards as locked/unlocked based on localStorage discovery state. This is the ARG mechanic — great for pre-release, but on release day it becomes a barrier. A new visitor from social media will see 4 locked cards with "???" and have no idea what to do.

**Recommendation: Add a "release mode" toggle.** Two options (Simon picks):

- **Option A — Unlock all tracks on release day.** Add a `?open` query parameter or a date check (after March 6) that auto-marks all tracks as discovered. The ARG hunt is over; the music is here. Visitors still get the full visualizer experience per track. The "0 of 4 discovered" counter becomes "all 4 discovered" immediately. This is the cleanest approach.

- **Option B — Keep the ARG alive.** Leave the discovery mechanic running. New visitors must find the track URLs themselves (or have them shared by someone who already found them). This rewards the early fans but risks confusing release-day traffic from social media who just want to hear the music. Could feel like a dead end if someone clicks from an Instagram post and sees 4 locked question marks.

**My take:** Option A with a twist. On release day, add a small script to the hub page:

```javascript
// After March 6, auto-discover all tracks for new visitors
const RELEASE_DATE = new Date('2026-03-06T00:00:00-08:00');
if (Date.now() >= RELEASE_DATE.getTime()) {
  const d = getDiscovered();
  if (!d.belldingthing) { // Only auto-unlock for people who haven't started the hunt
    TRACKS.forEach(t => d[t.key] = true);
    localStorage.setItem('ch1-discovered', JSON.stringify(d));
    updateUI();
  }
}
```

This preserves the hunt for anyone who found tracks before release day (their localStorage already has partial discovery) while making the site immediately accessible to new visitors.

### Buy Page (ch1/buy.html) — Critical Fixes

**Stripe links are placeholders.** The three buy buttons all point to `https://buy.stripe.com/PLACEHOLDER_*`. These MUST be replaced with real Stripe Payment Links before launch, or removed entirely if Stripe isn't ready. Having visible broken "buy" buttons on release day is worse than not having them at all.

**If Stripe isn't ready by March 6:** Remove the Stripe tier cards temporarily and make Bandcamp the sole purchase path. Bandcamp is already linked and working. You can add Stripe tiers later — Bandcamp Friday is the priority anyway since Bandcamp waives their revenue share.

**The "Direct purchase" button on the hub page** (bottom of ch1/index.html) currently points to Bandcamp for both buttons. This is fine for launch.

### Thank You Page (ch1/thanks.html)

**Download links are all `#` placeholders.** The notice message ("Download links are being set up...") is good as a fallback, but ideally you'd have working download links by release day, or at minimum ensure the Bandcamp purchase flow handles delivery (which it does natively — Bandcamp emails download links automatically).

**Recommendation:** If using Bandcamp as primary sales channel for March 6, the thank you page may not even be needed yet. Bandcamp handles the entire purchase-to-download flow. Park this page for when Stripe is live.

### Press Page (ch1/press.html)

**Ready to go.** Bio, fact sheet, tracklist, pull quotes, story angles, contact — all solid. One tweak: the hero says "March 2026" generically. Could update to "Out Now — March 2026" on release day.

---

## 2. Social Media Strategy for Release Week

### The Calendar (March 4-10)

Bandcamp Friday is March 6. The existing content calendar (in the EPK doc) maps a 4-week buildup, but we're 2 days out. Here's a compressed, realistic plan:

#### March 4 (Today — Tuesday)
- **Instagram Story:** Teaser. Studio shot, headphones on, slight nod. Text overlay: "48 hours." No context. Let it breathe.
- **TikTok:** 15-second clip of one track playing over a close-up of hands on an instrument. Caption: "thursday." Nothing else.

#### March 5 (Wednesday — Eve)
- **Instagram Reel:** 30-45 seconds. Quick cuts: instruments, Ableton screen, studio at night, pressing a button. End card: "Ch.1 — Tomorrow." Include Bandcamp link in bio.
- **Instagram Story:** "Bandcamp Friday tomorrow. New music. Link in bio." Keep it direct — people need to know the mechanism.
- **TikTok:** Same reel content, reformatted for TikTok. Caption: "dropping something tomorrow on Bandcamp Friday"

#### March 6 (Thursday — RELEASE DAY / Bandcamp Friday)
- **Morning (8-9am PT):**
  - Update Instagram bio to include Bandcamp link prominently
  - **Instagram Post (static or carousel):** Album art + "Ch.1 is out. Four tracks. Every instrument, one person. Link in bio." This is the anchor post — everything else points back to it.
  - **Instagram Story:** "Ch.1 is out now on Bandcamp. Today is Bandcamp Friday — 100% goes to the artist." Include swipe-up/link sticker.

- **Midday (12pm PT):**
  - **TikTok:** Multi-instrument split-screen of an actual EP track. This is the money content — show the musicianship. Caption: "Ch.1 is out now. played everything on it myself. bandcamp link in bio"
  - **Instagram Reel:** Same split-screen, cross-posted.

- **Evening (6pm PT):**
  - **Instagram Story:** "Still Bandcamp Friday. Ch.1 is still out. Still played everything myself." Light humor, keep the link visible.
  - **Personal DMs:** Message your top 10-20 most engaged followers individually. "Hey — Ch.1 dropped today. Would mean a lot if you checked it out." Personal touch > broadcast.

#### March 7 (Friday — Day After)
- **Instagram Story:** Share any responses, screenshots, DMs (with permission). "People are listening. This is why I make music."
- **TikTok:** Quick "here's what one of the tracks sounds like on headphones" video. Simple, raw. Caption: "ch.1 came out yesterday. four tracks of funk. every instrument is me."

#### March 8-9 (Weekend)
- **Instagram Carousel:** Behind-the-scenes photos from the studio sessions. 4-5 slides. Each with a one-line caption about the track. This is evergreen content that works for new followers.
- **TikTok:** Pick the catchiest 15 seconds of any track and use it as a TikTok sound. Just vibes. Guitar or bass close-up.

#### March 10 (Monday)
- **Instagram Post:** Reflection. "First week with Ch.1 out in the world. Here's what I learned / felt / noticed." Authentic, no sales pitch. This builds the narrative for long-term followers.

### Platform Priority

1. **Instagram** — Primary. Your 1,350 followers are here. Stories for urgency, Posts/Reels for permanence.
2. **TikTok** — Discovery engine. Multi-instrument content performs extremely well on TikTok. This is where new fans find you.
3. **YouTube** — Secondary. Upload the Sonar music video if it's ready. Otherwise, park YouTube for post-release.
4. **Bandcamp** — The storefront. Make sure your Bandcamp page has tags, genre, location, description filled out. Bandcamp's internal discovery (genre pages, weekly best-sellers, Bandcamp Daily) is real and driven by release-day sales velocity.

### Key Principles

- **Don't over-post.** 2-3 pieces of content per day max on release day. More than that reads as desperate.
- **Lead with music, not marketing language.** Show yourself playing. Let the groove sell it.
- **Bandcamp Friday framing is your hook.** "100% goes to the artist" is a compelling CTA that aligns with the no-distributor ethos. Use it.
- **Personal messages > public posts.** One DM to someone who cares > one story that 100 people scroll past.
- **Don't link to the ch1 site initially.** Link to Bandcamp. The site is the deeper experience; Bandcamp is where money changes hands. Send purchase-ready traffic to Bandcamp. Send curious/exploring traffic to simonoto.com/ch1/.

---

## 3. Email/SMS List Engagement

### Current State

Based on the technical spec, the plan was to use ConvertKit (Kit) for email capture. Question: **Is the email list actually set up?** If not, here's the realistic play for the next 48 hours:

### If No Email List Exists Yet

Don't try to build one from scratch before Thursday. Instead:

- **Instagram Close Friends list:** Add your most engaged followers (people who DM you, comment regularly, attend Glory Jams). Post the Bandcamp link to Close Friends story 30 minutes before the public announcement. They get early access. This is your "email list" for this release.
- **Group text / WhatsApp:** If you have a crew chat, band group text, or Glory Jams WhatsApp — drop the link there with a personal message. "Ch.1 is out today. Played everything myself. Would mean a lot if you checked it out."
- **Professor of Funk parents:** If you have a contact list for student parents, a brief email: "Quick note — I just released my debut EP Ch.1 today. If you're curious about the music your kid's teacher makes, here's the link."

### If Email List Exists (Even Small)

- **March 5 (eve):** Send a short email. Subject: "Ch.1 drops tomorrow." Body: 3 sentences max. "I've been working on this for a long time. Four tracks, every instrument played by me. It comes out tomorrow on Bandcamp Friday — 100% goes direct to the artist. [Link]"
- **March 6 (release day, 9am):** Send the release email. Subject: "Ch.1 is out." Body: Album art, one paragraph, Bandcamp link, and the line "If you dig it, share it. That's all I'll ever ask."
- **March 10 (follow-up):** "First week update" email for anyone who opened the release email but didn't purchase. Light touch, not a hard sell.

### SMS

SMS feels too aggressive for a debut EP unless you have an existing SMS relationship with people (like Professor of Funk students). Group text to close friends/family is fine and natural. Don't set up a formal SMS marketing system for this release — it's overkill.

---

## 4. Last-Minute Site Improvements Before Launch

### Critical (Must Fix Before March 6)

1. **Replace Stripe placeholder URLs or remove Stripe tiers.** The buy page (ch1/buy.html) has three `PLACEHOLDER` Stripe links. Either replace them with real Payment Links or temporarily hide the Stripe tier cards and make Bandcamp the only buy option. Broken buy buttons = lost sales.

2. **Add Open Graph / social preview meta tags to the hub page.** The hub page (ch1/index.html) has a `<meta name="description">` but no Open Graph tags. When someone shares the link on Instagram/Twitter/iMessage, it will show a generic preview. Add:
   ```html
   <meta property="og:title" content="Ch.1 — Simonoto">
   <meta property="og:description" content="Debut EP. Four tracks. Every instrument, one person. Oakland, 2026.">
   <meta property="og:image" content="https://simonoto.com/ch1/artwork.jpg">
   <meta property="og:url" content="https://simonoto.com/ch1/">
   <meta property="og:type" content="music.album">
   ```
   (The press page already has these — just copy the pattern.)

3. **Implement "release mode" unlock** (Option A from Section 1). The 5-line JS snippet that auto-discovers all tracks after March 6. Without this, release-day visitors from social media will bounce off a page full of question marks.

### Nice-to-Have (If Time Permits)

4. **Add Bandcamp Friday banner.** A small, dismissible banner at the top of the hub page and buy page: "It's Bandcamp Friday — 100% of your purchase goes directly to the artist." Coral background, monospace text, X to dismiss. Remove after March 7.

5. **Update "Direct purchase" button text on hub page.** Both purchase buttons on the hub currently link to Bandcamp. Either differentiate them (one to Bandcamp, one to the buy.html page) or consolidate to a single "Buy on Bandcamp" button. Two identical-looking buttons pointing to the same URL is confusing.

6. **Test all audio files load.** The mp3 files at `/audio/ch1/*.mp3` — verify they exist, load, and play on mobile Safari and Chrome. Audio autoplay restrictions vary by browser.

7. **Test the discovery mechanic end-to-end.** Open an incognito window, visit each track URL directly, then go back to the hub. Confirm all 4 dots light up and track names appear.

### Not Worth Doing Before Launch

- Firebase RTDB community tracker (the `discovered.html` page). The localStorage approach works fine. Community tracking is a nice-to-have for the ARG phase; on release day people just want to listen and buy.
- ConvertKit email capture integration. If it's not set up yet, don't scramble. Use Instagram Close Friends as your early-access channel.
- Custom 404 page. Cool ARG touch but zero impact on release-day sales.

---

## Decision Checklist for Simon

- [ ] **Stripe ready?** If yes → update Payment Links in buy.html. If no → remove Stripe tiers, go Bandcamp-only for launch.
- [ ] **Email list?** If yes → schedule eve + release emails. If no → use Instagram Close Friends + personal DMs.
- [ ] **Unlock tracks on release day?** (Recommendation: yes, via the date-check script.)
- [ ] **Add OG meta tags to hub page?** (Recommendation: yes, takes 2 minutes.)
- [ ] **Content ready for March 5-6?** Studio footage, split-screen multi-instrument clip, album art for static post.
- [ ] **Bandcamp page finalized?** Tags, genre, location, description, pricing all set.
- [ ] **Instagram bio updated?** Bandcamp link prominent, "Ch.1 out March 6" in bio text.

---

## TL;DR

The site is 90% ready. The three things that matter most in the next 48 hours:

1. **Fix or remove the placeholder Stripe links** so no one hits a dead buy button
2. **Add the release-day track unlock** so social media visitors can actually listen
3. **Post to Instagram/TikTok with Bandcamp link** — Bandcamp Friday is your best friend for a debut EP drop

Everything else is polish. The music is made. The site is built. Now it just needs to be seen.
