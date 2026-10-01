# LiveQueue — Google Search Ads setup

Everything here is ready to copy and paste. Budget assumed: ₹200–300 a day.

---

## Part 1 — Create the account the right way

1. Go to **ads.google.com** and sign in with your Google account (the same one you use for Search Console is fine).
2. Google will push you into a simplified "Smart" setup. **Don't use it** — it spends your money automatically with almost no control. On the first screen, look for **"Switch to Expert Mode"** at the bottom, or **"Create an account without a campaign"**.
3. Set: Country **India**, Currency **INR (₹)**, Time zone **(GMT+5:30) India**.
   **The currency and time zone can never be changed later.**
4. Add your payment method. India is prepaid for most new accounts: you add money first and ads run until it is used up. **18% GST is added on top of your spend**, so ₹5,000 of ads costs about ₹5,900.
5. If you have a GSTIN, enter it in Billing settings now, so you can claim the tax back.

---

## Part 2 — Set up conversion tracking FIRST

Do this before you spend a rupee. Without it, you're paying for clicks and guessing which ones became clinics.

1. In Google Ads: **Goals → Conversions → New conversion action → Website**.
2. Enter `livequeue.co.in`. Create a conversion called **Signup**, category **Sign-up**, value: leave blank or set ₹500 (your estimate of what a clinic is worth).
3. Google gives you a **Google tag (gtag.js)** snippet plus a conversion event snippet.
4. That code has to go into the site: the tag in `index.html`, and the conversion event fired when a host account is created — exactly like the Meta Pixel does now.

**I can add this to App.jsx and index.html for you** — just paste me the tag ID (it looks like `AW-XXXXXXXXX`) and the conversion label. Those two are public identifiers, not secrets.

---

## Part 3 — Create the campaign

**New campaign → Objective: Leads → Campaign type: Search.**

| Setting | Value |
|---|---|
| Campaign name | LQ – Search – Clinics |
| Networks | **Untick "Search partners"** and **untick "Display Network"** |
| Locations | Start with **Kerala** only. Use *Presence: people in your targeted locations* (not "interested in") |
| Languages | English and Malayalam |
| Bidding | **Maximize clicks**, with a **maximum CPC limit of ₹20** |
| Daily budget | ₹200–300 |
| Ad rotation | Optimise: prefer best performing |
| AI Max / broad match suggestions | **Off** for now |

Switch bidding to **Maximize conversions** only after you've recorded about 15–30 signups.

---

## Part 4 — Keywords

One ad group: **Token display**. Paste these in as **phrase match** (each one wrapped in quotes):

```
"token display system for clinic"
"clinic token display"
"token display software"
"token number display software"
"queue management system for clinic"
"queue management software for hospital"
"patient queue management system"
"op token system"
"token calling system for clinic"
"digital token display system"
"token management software"
"clinic queue display"
"hospital token display system"
"token system for doctors clinic"
"online token booking for clinic"
```

### Negative keywords (add these on day 1)

These stop you paying for students, hardware buyers and job seekers:

```
free download
crack
github
source code
project
mini project
project report
arduino
raspberry pi
circuit
diagram
led
display board
hardware
machine price
jobs
salary
course
pdf
ppt
bank
restaurant
canteen
temple
parking
```

Add them at **Campaign → Keywords → Negative keywords**.

---

## Part 5 — The ad (Responsive Search Ad)

**Final URL:** `https://livequeue.co.in/welcome`
**Display path:** `livequeue.co.in/clinic-token`

### Headlines (paste each on its own line)

```
Clinic Token Display
Live Token Number on TV
No Token Machine Needed
Free for 1,500 Tokens
Set Up in 2 Minutes
Token on Patient's Phone
Queue System for Clinics
Works on Any Smart TV
No Credit Card Needed
Calls the Token Aloud
Start Free Today
OP Token System Online
Token Display Software
Free Clinic Queue System
End Reception Crowding
```

Pin **"Clinic Token Display"** to Headline position 1.

### Descriptions

```
Show your live token number on any TV and on every patient's phone. No machine to buy.
Free for your first 1,500 tokens. No credit card needed. Set up your desk in two minutes.
Patients scan a QR code and wait anywhere. Your reception stays calm all day.
Tap Next and every screen updates at once, and the number is called out loud.
```

### Sitelinks (free extra space, adds clicks)

| Text | URL | Description line 1 | Description line 2 |
|---|---|---|---|
| How it works | /welcome | See the whole flow | TV, phone and poster |
| Start free | /login | 1,500 tokens free | No card needed |
| Contact us | /contact | Questions before you start | We reply the same day |
| Refund policy | /refunds | Clear and simple | Read before you pay |

### Callouts

```
1,500 tokens free
No hardware to buy
Works on any smart TV
Set up in minutes
Voice announcements
```

---

## Part 6 — What to do each week

1. **Campaign → Insights → Search terms.** This shows the *actual* words people typed. Add anything irrelevant as a negative keyword. This one habit saves the most money.
2. Any search term that brought a signup: add it as its own keyword.
3. Don't touch bids or budget for the first two weeks. Changing settings daily resets Google's learning.
4. After 30 days, judge it on **cost per signup**, not on clicks. If a signup costs less than a clinic is worth to you over a year, increase the budget. If nothing converts after ~₹5,000 of spend, stop — the searches simply aren't there, and that's useful information too.

---

## Honest expectation

The Indian search volume for "clinic token display" is small — perhaps a few hundred searches a month. So this channel will not flood you with signups. What it *will* do is catch the clinics who are already looking for a solution, at a low cost, while your calls, visits and postcards create the demand. Small but high quality, which is the opposite of what the Facebook ads have been.
