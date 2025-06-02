# HN Menu Bar Reader

A simple macOS menu bar app that shows Hacker News stories. Started as a basic reader, ended up tracking way more data than I originally planned.

## What it does

Shows the top 25 HN stories in your menu bar. Click one to read it. Pretty straightforward.

But then I got carried away and added a bunch of analytics because why not track everything, right?

## The basics

- Top 25 stories refresh every 5 minutes
- Shows upvote counts with that little triangle ▲
- Click a story to open the HN comments page
- Stories line up nicely (took way too long to get the spacing right)

## The analytics rabbit hole

Once I started tracking clicks, I couldn't stop:

- **SQLite database** stores every click with way too much metadata
- **Link stats** shows which stories you clicked most (prepare to be judged by your own habits)
- **Word cloud** turns your reading history into a pretty visualization
- Tracks when stories first appeared because timestamps are fun

## Getting it running

```bash
git clone this-repo
cd mac_hn
npm install
npm start
```

The app shows up in your menu bar. Look for the HN icon.

## What gets tracked

Every time you click a story:
- When you clicked it
- The story title and points
- How many comments it had
- When I first saw that story
- Probably more stuff I forgot about

All stored in a local SQLite file called `clicks.db`.

## Development stuff

Has live reloading because constantly restarting Electron gets old fast. Change code, app restarts automatically.

## Why this exists

Started wanting a simple HN reader in my menu bar. Ended up with a personal analytics engine for my reading habits. Classic feature creep.

The word cloud is probably overkill but it looks cool.

## Database tables

Two tables because I overthought this:

**stories** - when I first saw each story
**clicks** - every single click with full context

The schema is in the code if you care about the details.

---

Uses the official HN API. Data stays local. Your reading habits are your business.