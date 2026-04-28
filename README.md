# Noodle Nights Verification Portal

A privacy-first age verification system for Noodle Nights. You upload a photo of your ID, a staff member checks your date of birth, and then **your document is permanently deleted** — it is never saved to a file, a database, or anywhere else.

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> Looking for full technical documentation? See [TECHNICAL.md](TECHNICAL.md).

---

## What is this?

When you want to attend certain Noodle Nights events, you need to prove you are old enough. This portal lets you do that **without handing your ID to anyone in person** and without us keeping a copy of it.

You upload a photo of your ID through this website. A staff member looks at it once to check your date of birth, clicks "Done", and it is gone. No one can look at it again after that — not even the same staff member.

---

## What happens to your ID photo?

- It is held **in the server's memory only** — the same way a web page lives in your browser's memory while you have it open.
- It is **never written to a file** or saved to a database.
- After the staff member clicks "Done", the memory holding your photo is **overwritten with zeros** and discarded. It cannot be recovered.
- If you upload but no one checks it within 24 hours, it is automatically deleted.
- The server itself runs on a dedicated machine controlled by Noodle Nights. No third-party cloud storage is involved.

---

## How do I get verified?

1. Go to the verification portal and upload a clear photo of your photo ID (passport, driver's licence, etc.).
2. You will receive a short **verification code** — a string of letters and numbers.
3. Send that code to a Noodle Nights staff member via Discord DM.
4. The staff member will look up your code, check your date of birth, and mark you as verified.
5. That is it — your document is deleted immediately.

You do **not** need a Discord account to submit your ID. Only staff use Discord to log in.

---

## Who can see my ID?

Only Noodle Nights staff who:
- Are members of the official Noodle Nights Discord server, **and**
- Hold the specific verified staff role.

Staff log in using Discord — there is no separate password. They can only look up a document if they have your specific verification code. They cannot browse through everyone's submissions.

Each document can only be opened **once**. The moment a staff member opens your document to check it, it is "claimed" and no one else — including that same staff member — can open it again.

---

## Can I see the code behind this?

Yes — this entire project is open source. You can read every line of the server, the web pages, and the configuration files in this repository.

The server setup process (installing software, configuring the web server, hardening SSH, etc.) was recorded and published so you can see exactly how the machine was set up:

**[Watch the server setup recording on asciinema →](https://asciinema.org/a/5VwWwCQrrXKWWhZB)**

> The only information removed from this recording before publishing is the server's IP addresses, SSH keys, and SSL certificate. Everything else is shown exactly as it happened.

---

## License

MIT © Noodle Nights

