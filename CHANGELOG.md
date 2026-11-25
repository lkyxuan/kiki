# Changelog

Every Kiki release, newest first. Kiki updates itself; you can also read this in the app under Settings › Software Update, or online at [getkiki.ai/changelog](https://getkiki.ai/changelog/).

<!-- One section per release: "## <version> — <YYYY-MM-DD>", then one bullet per change in plain English that a user understands
     (start with Added / Fixed / Improved / … ). No internal details, PR numbers or private names. PRs don't edit this file: each adds a note in changelog.d/,
     and on merge the release workflow bumps the version and assembles the notes into a new section here. -->

## 0.7.67 — 2026-11-26
- Improved: A team member's page no longer shows walls of internal notes. Hand-ins and results passed between members now show as one short plain sentence, with the full text folded underneath.

## 0.7.66 — 2026-11-26
- Fixed: Claude Code members no longer get stuck on the "add this directory" prompt or on approving Kiki's own tools when nobody is watching.

## 0.7.65 — 2026-11-26
- Fixed: The "stuck" cards from team members now open with a short plain sentence instead of the member's raw note with ticket numbers and jargon.
- Fixed: When two team members keep sending the same missing-material request back and forth, Kiki now asks you after the second time instead of opening more tickets.

## 0.7.64 — 2026-11-26
- Improved: The send allowlist is now a list you tick instead of a text box, and anything you approved once on a card shows up under "Always allow" so you can make it automatic with one switch.

## 0.7.63 — 2026-11-26
- Improved: the Kiki home page uses less graphics work, so it stays smoother on computers without strong graphics.
- Added: Smooth mode. When your computer is struggling, Kiki stands still instead of gently breathing so everything runs smoother. It turns on by itself, and you can switch it in Settings › Appearance.
- Fixed: Kiki's idle breathing animation moves gently up and down again instead of slightly zooming.

## 0.7.62 — 2026-11-26
- Added: Every approval card now has "Always allow", including cards on the Kiki page and Space. For Claude Code permission requests it passes back Claude Code's own "don't ask again" rule.

## 0.7.61 — 2026-11-26
- Added: Settings › Auto-approve now has "Trusted sources": tasks handed to Kiki by agents you connected yourself (such as Claude Code or Codex) are treated as your own request, so Kiki asks you instead of refusing outright.

## 0.7.60 — 2026-11-26
- Fixed: When a model API key stops working, background jobs now pause and retry every few minutes instead of failing over and over and filling the log.

## 0.7.59 — 2026-11-26
- Improved: In the three-column chat and a member's conversation, each pending item now shows as one card instead of being repeated in several places, ticket numbers are replaced by a "Trace" link, and corners follow the style you picked in Settings › Appearance.

## 0.7.58 — 2026-11-25
- Added: Kiki can run its Claude Code sessions on a separate Claude account (set KIKI_CLAUDE_OAUTH_TOKEN from `claude setup-token`), leaving your own Claude Code login untouched.

## 0.7.57 — 2026-11-25
- Improved: the Kiki page now follows your chosen style: corners match it, and the game styles get their own look (classic RPG windows, pixel frames, comic ink lines, a visual-novel dialogue box at the bottom, and cut-corner HUD cards).

## 0.7.56 — 2026-11-25
- Added: Settings › Appearance › Style lets you switch the whole app between 15 looks, each with its own colors and corner shape (square, small rounded, rounded, or game-style cut corners). The default looks stay the same.
- Changed: buttons in the default look are no longer pill-shaped; corners now follow the chosen style.

## 0.7.55 — 2026-11-25
- Improved: short texts Kiki writes for you in the background (quick replies, button choices, card summaries, conversation names, overview recaps, suggestions and plans) now follow the same plain-language rules and leave out commit hashes and ticket numbers.

## 0.7.54 — 2026-11-25
- Fixed: When Kiki reports back, anything not done yet or only checked comes first instead of in the last line.

## 0.7.53 — 2026-11-25
- Improved: flowcharts, sequence diagrams and class diagrams in chat are now drawn in the hand-drawn Excalidraw whiteboard style, with sketchy lines and handwritten text (a one-time download of about 19MB the first time you see a diagram). Other diagram types follow your current look. Under each diagram you can zoom in full screen (scroll to zoom, drag to move), copy the source, or save it as an image.

## 0.7.52 — 2026-11-25
- Improved: Long hashes and conversation IDs in replies now fold into a small tag you can click to see the full text and copy it, and GitHub links show the GitHub icon with a short name.

## 0.7.51 — 2026-11-25
- Fixed: when you ask Kiki from WeChat or Feishu, the finished result is sent back there again (only Kiki's summary; the full report stays in the Kiki window).
- Fixed: results from scheduled tasks and webhooks, and bundled updates, are now part of Kiki's conversation, so she can answer follow-up questions about them using the full report.

## 0.7.50 — 2026-11-25
- Improved: members and Kiki now write in full, natural sentences (numbered lists when there are several items) instead of clipped fragments, and Kiki adds a line of her own when she passes work on.
- Improved: when members finish, Kiki now tells you how it went in her own words with a separate writing step, instead of showing members' raw reports; the original is still folded underneath.
- Improved: messages Kiki composes itself (stuck work, failed work, errors, rule changes) now read as plain sentences instead of internal status codes and ticket numbers.
- Improved: every message Kiki shows you that isn't a verbatim original (members' results, cards members want you to see, and the opening line when several updates arrive together) is now written by one shared step, so it reads the same way everywhere.
- Improved: the built-in routing rules and Kiki's own notes no longer say Kiki answers one-line questions herself, and the default "About me" answer style now asks for full plain sentences instead of "brief and direct". Lines you changed yourself are left alone.
- Improved: Kiki's summaries are now written in her own words instead of pasting members' reports, and messages no longer fill up with commit hashes or long IDs; links go in a folded section.
- Improved: checklist steps stay short and don't get results tacked on, so the progress card is easier to read.

## 0.7.49 — 2026-11-25
- Fixed: when a team member checks a private page (like a commit in a private GitHub repo) and the plain page reader gets "not found", it now opens the page in your signed-in browser instead of reporting that the page doesn't exist.

## 0.7.48 — 2026-11-25
- Improved: "Later" on a Kiki page card now sets it aside until a time you pick (in 1 hour, tomorrow morning or next Monday) instead of just moving it to the back. Set-aside items are listed under "For you" in Space, where you can bring them back early.

## 0.7.47 — 2026-11-25
- Fixed: clicking "Done" on a Claude Code / Codex card now only clears that card. If the conversation later asks you something, hits an error or needs approval, a new card shows up again.
- Fixed: replying "go ahead"-style words you have said before in a conversation now brings its card back instead of being mistaken for an automatic message.
- Added: Kiki keeps a step-by-step log of every outside conversation (who moved it, and why), so you can ask her why a card disappeared.

## 0.7.46 — 2026-11-25
- Fixed: when the browser tab used for Antigravity has wandered off to another page or lost its connection, a team member now reopens Antigravity in that tab (or a new one) and tries again, instead of stopping and asking you.

## 0.7.45 — 2026-11-25
- Added: when Kiki can't start, it now checks why by itself and shows the cause, what to do, the last log lines, and buttons to retry, roll back to the previous version, or report the problem.

## 0.7.44 — 2026-11-25
- Added: flowcharts and sequence diagrams written as Mermaid code blocks are now drawn as diagrams in chats and documents. The small drawing add-on installs itself the first time one shows up.

## 0.7.43 — 2026-11-25
- Added: The Usage card and page now show how much of your Codex, Claude Code and Antigravity subscription quota is left (5-hour and 7-day windows) and when it resets; Kiki tells you when one drops below 10% or runs out.

## 0.7.42 — 2026-11-25
- Fixed: Asking how much was spent today no longer bounces between members; the usage member now reports Kiki's own spend by member, model and purpose, with input, output and cache tokens.

## 0.7.41 — 2026-11-25
- Added: an optional on-demand "vector model" component (Settings › General › On-demand installs, about 40MB, runs locally). Once installed, Kiki's background routing log also compares requests with members by meaning; it does not change who gets the job yet.

## 0.7.40 — 2026-11-25
- Added: Settings › Remote access now shows QR codes, so you can open Kiki on your phone by scanning with the camera instead of copying a long link.

## 0.7.39 — 2026-11-25
- Added: members can now find and use skills you installed for Claude Code, Codex, pi and OpenCode, not just the ones in ~/.agents. They stay out of every prompt by default and are looked up only when needed; skills with the same name are counted once.

## 0.7.38 — 2026-11-25
- Improved: when Kiki isn't sure who should get a task, the "who should do this" card now shows the three most likely team members instead of everyone.
- Improved: Kiki now double-checks before handing a task about one project to a team member who only works on another project.

## 0.7.37 — 2026-11-25
- Added: Trace now has its own spot in the sidebar and opens on a timeline. Every ticket is a same-size card placed at the time it was opened, with lines showing who handed work to whom and which tickets reached `end`. Click a card to see its details on the right. The old card-by-card browser is still one click away.

## 0.7.36 — 2026-11-25
- Added: Kiki now quietly keeps a local record of who it would have picked for each task next to who actually got it, so routing can be measured before it changes. Nothing about how tasks are handed out changes yet.

## 0.7.35 — 2026-11-25
- Fixed: When a member loses its connection to the model mid-job, Kiki now waits and lets it carry on by itself (after 1, 2, 3, 5, 8… minutes) instead of nagging it to hand in and marking the job stuck; repeated identical errors show as one line with a count.

## 0.7.34 — 2026-11-25
- Added: you can attach any file (PDF, spreadsheet, zip…, up to 50MB) in a chat, not just images, and the member gets it.
- Improved: each attachment shows a card that spins while uploading, shows the size when done, and turns red with a Retry button if it fails.

## 0.7.33 — 2026-11-25
- Security: Messages that come from outside (letters from other agents, replies on things you are watching, activity on pull requests) are now recognised by where they came from, not by their wording, so they are never treated as your own instruction.

## 0.7.32 — 2026-11-25
- Added: Settings › Capabilities now lists the small chores Kiki runs after every turn (summaries, result checks, naming and so on). Each row says what you lose if you turn it off and what it cost over the last 7 days, and each has its own switch.

## 0.7.31 — 2026-11-25
- Improved: On a new install, Kiki no longer picks a pay-per-use model for background chores on its own. The first time one is needed, Kiki asks once, showing the cheapest model and its price, and only uses it after you say yes. Existing installs keep working as before.

## 0.7.30 — 2026-11-25
- Fixed: When a member's browser is paused and waiting for you, it now shows up under "Needs you" with a Continue button, instead of a floating bar covering the Space overview.
- Changed: The "member is using your browser" bar now appears only in that member's own chat, not on every page.
- Fixed: The browser status bar no longer shows internal action names or raw English errors; it says what is happening in plain words.

## 0.7.29 — 2026-11-25
- Improved: when a task is finished, Kiki now closes it in the task ledger by itself, so nothing keeps running after that. You only review: marking the card done needs nothing more, and if the result isn't right, just say so in that conversation and Kiki reopens it as a new task linked to the old one. The trace page shows where each task ended and which task it was reopened from.

## 0.7.28 — 2026-11-25
- Improved: team members using the browser get through pages faster. Clicking, typing or opening a page now comes back with the updated page, so they no longer need an extra step to look at it each time.

## 0.7.27 — 2026-11-25
- Fixed: a team member can start a new Antigravity conversation again after the remote machine has been idle for a while. Kiki now wakes it up and waits until it is ready, instead of failing with "Precondition check failed".
- Fixed: messages a team member sends into an existing Antigravity conversation are delivered right away, like the ones you type on the web page.

## 0.7.26 — 2026-11-25
- Changed: skills installed for other coding tools in your home folder's shared skills directory are no longer sent to every member each turn. Members now look them up only when needed, which keeps each turn smaller; you can set any of them back to always loaded in the toolbox.

## 0.7.25 — 2026-11-25
- Added: each member's “Skills & tools” panel now shows how many tokens that member carries into every turn, with a suggested limit. Click it to see every loaded skill and tool as a small card; click a card to read what it does, whether it is always loaded or looked up when needed, and how many tokens it takes (plus the size of a skill's full text, which is read only when used).

## 0.7.24 — 2026-11-25
- Fixed: right after the Usage member first sets itself up, it no longer re-reads the whole last 30 days a minute later; it now checks just today until the next full read half an hour on.

## 0.7.23 — 2026-11-25
- Improved: Kiki no longer suggests adding a new team member unless she can name the existing member who comes closest and say why that member can't take the work. How often she asks is now counted, so repeated asks point at a member whose description needs fixing instead of at yet another hire.

## 0.7.22 — 2026-11-25
- Improved: in a team member's list of conversations, a job that was split up and handed to other members now shows how many pieces it became and how many are finished, for example "split into 3 · 2 done".
- Improved: when a team member fetches something from the internet with a command (a web page, a GitHub thread), Kiki now treats what came back as outside content, the same as mail or web search results. For the rest of that turn, sending, paying or deleting still needs a target you named or allowed.
- Fixed: personal things like "remember I have a dinner on Thursday" no longer go to the Archivist and sit in About me forever. Kiki now hands dinners, doctor visits, trips and family plans to your life assistant, and if you don't have one yet, HR asks whether to create it.
- Fixed: when a life assistant joins your team, personal items saved earlier in About me or with the Archivist are moved over to it, so nothing is left behind or kept twice.
- Improved: a member whose role is about personal life now shows up under Life on the Kiki page.
- Fixed: when a member mentions a file that someone else is still going to write, Kiki no longer shows it as a document card marked "not written".
- Fixed: when a team member sends work to Antigravity, Kiki now checks the message really shows up in the conversation before saying it was sent, and reports it plainly when it didn't.
- Fixed: Antigravity's progress no longer shows as "still working" forever when it has actually stopped and only a background command is left running.
- Added: Settings › Capabilities now lists the routines Kiki runs on her own in the background, with an estimate of what each costs per day and a switch for each. The ones that spend model money are off on a fresh install until you turn them on; ones already running before the update keep running.
- Improved: Kiki's speech bubble now answers only your latest message in one or two sentences, without ticket numbers or links.
- Improved: Updates about other work show up as small one-line notices instead of being mixed into her reply; click one to read it in full.

## 0.7.21 — 2026-11-24
- Improved: opening a team member's main conversation now shows all of that member's conversations next to it, listed the way a chat app lists threads, instead of opening one of them for you. A conversation opens only when you click it, and the arrow at its top left takes you back to the list. They are grouped into waiting for you, working, recent and done, and each one shows a status icon, the latest line of progress, how long ago it moved, its job number (click it to trace the job) and any pull request it is watching. Files the member handed in sit in a row at the top of the right side, ready to open.

## 0.7.20 — 2026-11-24
- Improved: HR's suggestion cards are shorter. The card now shows just the question and one short line on what happens if you say yes. The reason (who on your team comes closest) no longer takes up space on the card; hover over the card to see it.
- Fixed: when a team member has put a suggestion card in front of you, the message under it no longer repeats the card or shows the hand-off notes meant for Kiki. It just says it is waiting for you on the card above.
- Fixed: hand-off notes about which member picks up the rest of a job are no longer shown to you anywhere; Kiki still gets them and passes the work on.

## 0.7.19 — 2026-11-24
- Added: Kiki now has a small icon in the Mac menu bar. It turns orange with a count when something is waiting for you. Click it to see those items and open any of them, see who is working, open Kiki, turn the desk pet on or off, or pause alerts for an hour. You can turn the icon off under View › Menu Bar Icon.
- Added: global shortcuts that work from any app: Option-Command-K opens Kiki, and Option-Command-J opens a small box where you can type a message to Kiki and press Return. You can turn them off in the Kiki menu.

## 0.7.18 — 2026-11-24
- Improved: talking with a team member on Kiki's page now looks like one game screen instead of business panels. The conversation sits in a single angled "comms deck" that runs from just under the top tabs to the bottom of the window, with the task's steps as a row of step tiles, each line of talk on its own row, and the "for you" card and input built in. Kiki stays full size, and the member's glowing robot floats at her head height across from her.

## 0.7.17 — 2026-11-24
- Fixed: images you attach when asking Kiki for something now travel with the job to every member it is handed to, including a member HR just hired for it, so they no longer ask you to send the picture again.
- Fixed: when you answer a team member's question inside its conversation, your bubble now shows only what you typed, without the internal wrapper text around it.

## 0.7.16 — 2026-11-24
- Improved: opening a team member's main conversation now also opens one of its task conversations on the right, like a chat app with a thread pane: the one waiting for you first, then one that is working, then the one you looked at last, then the most recent. When you say something and the member starts a new task for it, the right side switches to that task so you can watch it work. On narrow laptop windows nothing opens by itself, so your chat is never covered.

## 0.7.15 — 2026-11-24
- Improved: a team member that hands work to Antigravity now starts a new conversation in your Antigravity project for each new job, instead of piling every job into one conversation. It only keeps talking in an existing conversation when following up on that same job.

## 0.7.14 — 2026-11-24
- Changed: team members no longer show placeholder portrait photos anywhere. Every member uses its logo tile again, and in a face-to-face talk on Kiki's page the member now appears as a small glowing robot floating in the scene, in its own color, instead of a big portrait card. New character art will come later.

## 0.7.13 — 2026-11-24

- Improved: when a team member gets stuck and asks you, the card now offers 2 to 3 ready-made choices Kiki thought up for that situation, each with a line on what happens if you pick it and one marked as recommended. "Not now" is always there, and you can still type your own answer below.
- Fixed: when HR has already put a suggestion card in front of you (for example "Hire a network manager?"), it no longer also says it is stuck and adds a second card with only "Not now". It just says it is waiting for you to decide on that card.
- Added: Settings › Models has a new line, "Options when stuck", so you can pick which model drafts those choices.

## 0.7.12 — 2026-11-24

- Improved: in a team member's conversation, the card that asks you to check or answer something no longer sits in a strip across the top. It now pops up from the bottom right, just above the input box, looking and sitting like the cards on Kiki's review desk, so "Done" is in the same place everywhere. Tap "Later" to put the card away until something new comes in.

## 0.7.11 — 2026-11-24
- Fixed: when a team member checks on work it handed to Antigravity, it no longer sees the answer to an earlier message as if it were new. Until Antigravity answers the latest message, the member sees what Antigravity is doing right now: files it opened, commands it ran, and what it is thinking.

## 0.7.10 — 2026-11-24
- Added: the Kiki page now shows which version of Kiki you're running, in small type right after “Ms. Kiki” in the top-left corner.

## 0.7.9 — 2026-11-24
- Fixed: a team member that hands work to Antigravity no longer gets stuck after reading a brief or web page. Sending to the remote conversation written in its own description just works, and sending anywhere unfamiliar now shows a card with an Approve button instead of stopping with no way to say yes. Tap "always" on that card to trust that conversation from then on.

## 0.7.8 — 2026-11-24
- Improved: on Kiki's page, tapping a card about something Kiki herself is waiting on no longer opens a chat window. Kiki tells you right in her speech bubble: a short quote of what you last said, then what she needs from you, with her question in bold. The bubble is larger and closer to the middle of the screen, with a tail pointing at Kiki. You can answer right inside it: tap one of her choices, or type a reply. Tap "Read all" to see the full history.

## 0.7.7 — 2026-11-24
- Added: team members can hand work to your Antigravity remote conversations (start a new one, send a message, check whether it finished and read the answer, or stop it) through a Chrome profile with the Kiki extension that is signed in to Antigravity.

## 0.7.6 — 2026-11-24
- Improved: a team member's settings now show, under who does the work, whose rules that engine follows and which of the five things it can tell Kiki: taking a job, handing it in, getting stuck, asking for approval, asking you a question. Only engines that can take and hand in jobs can be picked for a team member.

## 0.7.5 — 2026-11-24
- Improved: the list of things that need you (approve, answer, review) is now put together in one place behind the scenes, so every screen and every device shows the same list. Tapping “Got it” on a failed or interrupted task now clears it everywhere, not just in the browser you tapped it in.

## 0.7.4 — 2026-11-24
- Improved: what team members hand back to you, the questions they ask you, the choices they put in front of you, and Kiki's own replies now follow the same short-and-clear rules as suggestion cards. Overlong answers, repeats of what you already said, and internal tool names are sent back to be rewritten before you see them.

## 0.7.3 — 2026-11-24
- Improved: when you tap a card on Kiki's page to see what's waiting for you, the conversation now shows just this part — your last message and the replies since — instead of the whole history. Tap "earlier messages" at the top to see everything.
- Fixed: opening Kiki's own conversation from a card now shows your messages on the right and Kiki's on the left, without a second Kiki standing opposite her.

## 0.7.2 — 2026-11-24
- Improved: suggestion cards (like "add a new team member?") are now short and easy to scan: one question, one sentence on what happens, and a one-line reason. They no longer repeat what you already said or show the internal rules meant for the team member; those go into the member's own profile when you tap OK.

## 0.7.1 — 2026-11-24
- Added: when background work quietly stops because a model key has expired, an account has run out of credit, or a chosen model no longer exists, Kiki now tells you once with a card that says what broke, which background jobs are paused, and where to fix it. The card goes away by itself once the problem is fixed, and you are not reminded again in the meantime.

## 0.7.0 — 2026-11-24
- Fixed: when typing with a Chinese (or other) input method, pressing Enter right after picking a word now sends your message straight away, instead of sometimes adding a new line. The Enter you press to confirm a word still never sends.

## 0.6.99 — 2026-11-24
- Fixed: with a translucent theme like SAO, the first-launch “Want Kiki with you?” screen and the “Give Kiki a brain” screen no longer let the app behind show through and overlap the text — the background is now frosted.

## 0.6.98 — 2026-11-24
- Fixed: a question Kiki is waiting on you to answer no longer disappears just because you said something about a different matter. Each matter keeps its own card until you answer it or close it.

## 0.6.97 — 2026-11-24
- Improved: on Kiki's page, opening a conversation from a card keeps you on the page. The card that needs you pops up on the right, just like on the desk, so you can approve, mark it done, pick an option or type a reply right there instead of using the bar at the top.
- Fixed: a desk card from an outside agent (like a Claude Code conversation) now says which app it is, with the tagged team member shown next to it, instead of looking like it came from that member.

## 0.6.96 — 2026-11-24
- Added: before every update, Kiki now keeps a full copy of your data. If a new version fails to start, Kiki goes back to the previous version together with the data exactly as it was before the update. Whatever the failed version changed is kept in a separate folder next to your data, not deleted.
- Improved: if that copy cannot be made (for example the disk is full), Kiki skips the update and tells you why instead of updating without a safety net.

## 0.6.95 — 2026-11-24
- Changed: background chores now have a daily budget of $1 by default. When it is reached, the rest of the day uses the cheapest model; at twice the budget they pause, and urgent jobs keep going. Kiki tells you when either happens. Work done through a subscription login does not count. Change the amount in Settings › Models, or enter 0 for no limit.

## 0.6.94 — 2026-11-24
- Improved: safer local controls. Every action in Kiki that changes something (approving, updating, restarting, changing settings) can no longer be triggered just by opening a link or loading an image address.

## 0.6.93 — 2026-11-24
- Improved: everything waiting on you now comes from one list with only three kinds of items: things to approve, things to answer, and finished work to check. The sidebar, the overview, Kiki's desk and the desk pet all show that same list.
- Fixed: one conversation no longer shows two differently worded cards for the same thing. An approval that is waiting on you is not covered by a "ready to check" card any more.
- Fixed: when Kiki or a teammate has only passed a task on and is still waiting for someone else, you no longer get a "ready to check" card. You get it once, when the whole thing is done.

## 0.6.92 — 2026-11-23
- Added: a Trace view in Space that works like a block explorer for your tasks. Click any task to see where it came from, which tasks it sent out, and whose results it used; go back step by step along the path you clicked; and read just the part of the conversation where that task was done. Each task shows its line and fingerprint in the tamper-proof task ledger, with a badge saying whether the ledger checks out.

## 0.6.91 — 2026-11-23
- Fixed: on Kiki's page, her lower body is no longer hidden behind a blurry fade. She now stands all the way down to the bottom edge of the window on every screen size.

## 0.6.90 — 2026-11-23
- Improved: Codex team members no longer stop to ask your permission every time they use one of Kiki's own tools (like the browser). Kiki still asks you itself before anything risky, such as posting or spending money.

## 0.6.89 — 2026-11-23
- Fixed: when a Codex or Claude Code team member stops to ask for permission, tapping Allow on Kiki's card now actually lets it continue. Before, the answer could be typed into the conversation as a new message and cancel the request.
- Fixed: a team member's own Codex conversation no longer also shows up as an outside conversation whose "Approve" button opened the Codex app, which then said the conversation was open elsewhere.

## 0.6.88 — 2026-11-23
- Fixed: on Kiki's page, the undo bar's countdown no longer makes the Undo button shift slightly every second, so it's easier to tap.

## 0.6.87 — 2026-11-23
- Changed: when there's a lot waiting for you on Kiki's page, the scene behind her now only gets darker and duller. It no longer gets blurry.

## 0.6.86 — 2026-11-23
- Added: Ops can now look at your Mac for you. Ask "why is my computer so slow?" or "what's filling my disk?" and it checks CPU, memory, disk space, battery, temperature and the apps using the most, then tells you the cause and what to do.
- Added: Kiki keeps an eye on your Mac in the background and tells you once a day per issue when the disk is nearly full, memory is tight, the CPU stays hot or one app keeps maxing out the CPU. Tell Ops to change when it warns you (for example "warn me when disk is below 5%"), or turn it off under Settings › Capabilities. It doesn't use any AI credits.

## 0.6.85 — 2026-11-23
- Improved: Settings open much faster when Kiki is running on another computer. Kiki keeps the page's scripts and fonts cached and only loads each section's data when you open that section. Opening Settings again now shows text in under a second instead of about two.
- Improved: while Settings are loading you now see "Loading settings…" instead of a blank box. If the other computer is slow or unreachable, Kiki says which computer it is waiting for.
- Improved: when you tap Approve or an option on a card, the button changes to "Sending…" right away and then to "Received ✓". If the tap doesn't go through, the button comes back and Kiki tells you why, so you can tap again.
- Improved: on Kiki's page, the undo bar now counts down "sending in 5s" and then says "Sent", so it's clear the decision is waiting for the undo window and not stuck.

## 0.6.84 — 2026-11-23
- Fixed: when a Codex team member wanted to use one of Kiki's tools (like the browser) and Codex asked for permission first, Kiki didn't recognize the question, so no card appeared and the job just sat there. It now shows up as an approval card like any other.

## 0.6.83 — 2026-11-23
- Improved: when a member asks you to choose, each option now comes with one line on what happens if you pick it, and Kiki marks the option it recommends and says why.
- Improved: choice cards now sit in the conversation under the latest message instead of floating over the input box, and each card ends with its own reply box. Type there to answer that card, and the card goes away once it's sent.
- Improved: hand-off and suggestion cards are written for you: no internal tool or field names, the "what's missing" line appears once instead of three times, and anything you need to do is called out on its own line.
- Improved: scheduled jobs show their name ("Scheduled job: …") instead of the raw instructions sent to the member.
- Fixed: the weekly check of members' job descriptions no longer gets stuck trying to read other members' conversations; it now works from each member's recent jobs.
- Fixed: when a member is stuck on something another member has, Kiki asks that member directly instead of asking you.
- Fixed: cards for cloud agent threads keep the thread's own name instead of a one-word reply like "OK".

## 0.6.82 — 2026-11-23
- Fixed: team members set to work on another computer couldn't start at all. Kiki sent the start command before that computer's terminal was ready, and the terminal refused it. Kiki now waits for the terminal and then sends it.

## 0.6.81 — 2026-11-23
- Improved: when the review desk on Kiki's page is empty, the scene behind her now shows in full, bright and sharp, with no dimming or blur. The usual soft overlay comes back as soon as there's something for you to decide.

## 0.6.80 — 2026-11-23
- Added: on Kiki's page, the scene behind her now follows your to-dos. The more decisions waiting on the review desk, the darker and softer the background, so you can focus. As you clear them it slowly comes back, and when the desk is empty it opens up like daybreak. A round with only one or two decisions is only slightly dimmed. You can turn this off in Settings › Appearance.

## 0.6.79 — 2026-11-23
- Improved: when Kiki hands a task to a team member, a small card showing who got it and what the task is now flies into that member's spot in the "Working" row, which stays highlighted and marked "New" for a moment. This replaces the thin orange line that sometimes shot off into an empty corner. On narrow windows, Kiki just says who she handed it to.
- Fixed: the hand-off effect no longer plays for scheduled jobs or work you started yourself, only for work Kiki actually handed out.

## 0.6.78 — 2026-11-23
- Added: the coding CLIs you open yourself in Terminal (Gemini CLI, Qwen Code, Kimi Code, Copilot CLI, Grok, Qoder, Factory Droid, OpenCode, Crush and Amp) now get Kiki's tools too, so they can ask Kiki, use Kiki's browser and hand work to Kiki. Kiki backs up each settings file first, leaves anything already named "kiki" alone, and removes only its own entry if you turn this off in Settings › Capabilities.
- Added: team members running on Grok can now use Kiki's tools when they work in their own folder.
- Fixed: team members running on Gemini CLI keep using their own connection to Kiki even when your personal Gemini settings also include Kiki.

## 0.6.77 — 2026-11-23
- Added: team members whose Claude Code or Codex runs on another computer can now use Kiki's tools there too: they hand in their work, pass jobs on and use Kiki's browser just like members on this Mac. Kiki connects back over the same SSH it already uses for that computer, so there is nothing to install or set up on the other side.

## 0.6.76 — 2026-11-23
- Fixed: on Kiki's page, the Work and Life places on the map were always empty because Kiki put every card from outside agents (Claude Code, Codex and others) into HQ. Now HQ only holds cards from Kiki and its built-in crew. A member's cards go to Life when the member's project tag is life, home or personal, and to Work otherwise.
- Added: when an outside agent starts a new conversation, Kiki decides whether it is work or life in the same quick check that matches it to a member. It remembers the answer for that folder or project, so later conversations from the same place are sorted without asking the model again. Conversations started from a general folder like your home folder, Desktop or Downloads are judged one by one. Anything Kiki can't place goes to Work.

## 0.6.75 — 2026-11-23
- Fixed: on Settings › Providers › DeepSeek, a key entered with “Change key” now clearly replaces the old one. Kiki keeps only one DeepSeek key: the key under “Advanced” is updated to the same new key, the label shows the key now in use (masked), and “Test connection” tests that key. Saving a key under “Advanced” likewise replaces the one entered with “Change key”.
- Fixed: the “OK” button in the key box no longer occasionally ignores a click while the page refreshes.
- Fixed: the 0.6.74 build didn't start, so its task ledger hash chain and startup snapshot ship in this version instead.

## 0.6.74 — 2026-11-23
- Added: Kiki now protects its task ledger with a hash chain. Every entry is linked to the one before it, and Kiki checks the whole ledger at startup and during the nightly review. If an entry was changed or removed, Kiki tells you which file and line.
- Improved: Kiki saves a snapshot of every task's status once a day and when it quits, so it starts up faster when the ledger gets long. If the snapshot doesn't match the ledger, Kiki ignores it and rebuilds from the ledger itself.
- Fixed: if the Mac lost power while Kiki was writing a ledger entry, the next entry could get stuck onto the half-written one. Kiki now seals off the broken line on startup.

## 0.6.73 — 2026-11-23
- Fixed (security): team members can no longer use Kiki's local interface to read your conversations, change approval settings, edit other members' instructions or approve things on your behalf. Kiki's own window now carries a private key that members can't read, and local requests without it are refused.
- Changed: to open Kiki in a regular browser on the same computer, or on your phone through Tailscale Serve, use the link in Settings › Remote (it includes the key) the first time. If the Mac app on another computer connects through an https://….ts.net address, paste that same link into “Connect to…” once. The Mac app on the same computer, and connecting by Tailscale IP, work as before.

## 0.6.72 — 2026-11-23
- Improved: Kiki now works out most "done / waiting for you / stuck" cards from what actually happened (a team member handed in, asked you, or just answered; an outside agent changed files, pushed code, or only chatted), and only asks a small model when it can't tell. Cards show up faster and use far fewer background tokens.

## 0.6.71 — 2026-11-22
- Fixed: a team member's card no longer pops back up when nothing new happened in that conversation (for example when its engine reconnects or retries quietly). Cards now come back only when there's a new reply to look at, and a card you marked Done stays done until then.

## 0.6.70 — 2026-11-22
- Improved: in light mode, Kiki's page now shows the scene behind her (office, city view and so on) instead of a nearly blank white page. The background stays softer behind the review desk so text there is still easy to read.

## 0.6.69 — 2026-11-22
- Fixed: when you open a "Waiting for your answer", "Stuck" or failed card from the review desk, the conversation now shows a Close (or Got it) button at the top, so you can clear the card right there instead of going back to find it. On the full Kiki page, the team member then steps away and you're back at the desk.

## 0.6.68 — 2026-11-22
- Fixed: cards from agents that report by email or MCP (like DOT) did nothing when you clicked "Go to chat". The button is now "Details" and opens what the agent reported, with a Done button to clear the card. To reply, answer in that agent's own app.

## 0.6.67 — 2026-11-22
- Fixed: on ultrawide, 2K and 4K screens, Kiki's speech bubble no longer sits on top of her head. It now follows her portrait, stays just to the right of her head on every screen size, and grows a little on big screens so it's easier to read.

## 0.6.66 — 2026-11-22
- Fixed: when a team member gets stuck on something you can't fix by answering (a broken connection, a missing way back to another agent), Kiki no longer dresses it up as a question for you. It reports the job as not done, or shows a "Stuck" card with the member's own words instead of "Waiting for your answer".
- Added: every "waiting for your answer" card now has a Close button, so you can drop a question you don't want to answer; the job behind it stops too. Failed and interrupted cards get a "Got it" button to dismiss them.

## 0.6.65 — 2026-11-22
- Improved: the archivist's nightly review is much easier to read. Each problem now gets its own card: a plain-language title saying what happened, one line for the cause, one line for the suggestion, and the task number in small print at the bottom of the card.
- Improved: results that come back to you now start with who did what ("Archivist's result for …"), with the task number folded away at the bottom.
- Improved: the daily direction check now lists the suggestions themselves instead of "board updated, 3 suggestions". Routine jobs like this no longer leave a "Waiting for you to check" card when they finish; you still get a card if they need an answer or something went wrong.

## 0.6.64 — 2026-11-22
- Added: a daily background budget at the top of Settings › Models › By task. Once background chores have spent it, the rest of the day uses the cheapest model you have; at twice the budget they pause, except urgent jobs like handing out work. Kiki tells you when either happens, and the row shows today's spend. Leave it empty for no limit.
- Added: each team member can have their own model. In Space › Members › settings, pick which model they work with and which model compacts their long conversations; leave them empty to follow your main settings.

## 0.6.63 — 2026-11-22
- Fixed: when an outside agent (for example Claude Code in your terminal) hands Kiki a task, the result now goes back to that agent instead of being passed around to other members. Before, a member could try to "hand it back", Kiki would give it to another member who couldn't take it, and the card ended in an error.
- Fixed: the same leftover step can no longer bounce between members over and over; Kiki stops after the first time and shows the result.

## 0.6.62 — 2026-11-22
- Added: on Ms. Kiki's page, opening a team member's task now plays out face to face. The member steps in on the right across from Ms. Kiki, the review desk steps aside, and the conversation runs between them: what was asked sits on her side, the member's replies on theirs. A tag under the member shows whether they're working, waiting for you, or done. Press Esc or × and they step out. After Kiki updates itself, the task you had open comes back quietly the same way.

## 0.6.61 — 2026-11-22
- Added: you can now pick a separate model for compacting long conversations (Settings › Models › By task › Compact context). When a working conversation gets long, that model writes the summary; if you leave it empty, or it fails, the conversation's own model does it as before.
- Added: every task in Settings › Models › By task now has a thinking level (off / low / medium / high) and a backup model. If the main model fails (rate limit, out of credit, provider down), Kiki tries the backup once. Rows you leave alone follow the row above them, like the model does.

## 0.6.60 — 2026-11-22
- Added: two master switches at the top of Settings › Models › By task. "Fast" covers quick background chores and, if you leave it empty, automatically picks the cheapest model you have connected. "Accurate" covers jobs that need good judgment and follows your default model. Per-task choices now sit under "Fine-tune each task" and still override the switches.
- Added: each task now shows how many times it ran, how many tokens it used and what it cost over the last 7 days, and the model list shows each model's price (or "subscription").

## 0.6.59 — 2026-11-22
- Improved: Settings › Models › By task now lists every background job that uses AI, grouped into "background chores", "needs good judgment" and "special abilities". New choices: checking results, naming chats, sorting incoming mail, writing plans, reports and polish, and daily reviews. Checking results is the most frequent background call, so you can now give it a cheap model of its own. Anything you leave unset follows the same model as before.
- Fixed: when Kiki's brain is a local Claude Code or Codex with no API model connected, filling in and rescuing dispatched jobs now goes through it again instead of being skipped.
- Removed: the unused "Write task brief" model choice.

## 0.6.58 — 2026-11-22
- Fixed: Ms. Kiki's page no longer opens a team member's conversation on top of her. After Kiki updated itself overnight it could reopen the last conversation you had open as a see-through half panel covering the top tabs. Now that conversation stays closed on her page; opening one (for example "View original") takes you to Space and slides it in there, and going back to Ms. Kiki closes it.
- Fixed: handoff cards no longer show an internal ticket number as their summary; they show what the job is.

## 0.6.57 — 2026-11-22
- Improved: "Merge when ready" in CI Monitor now also waits for the Codex code review to cover your latest push, with no open review comments left. If Codex only reviewed an earlier commit, Kiki asks it to review again and merges once it's done. The "Merge now" button follows the same rule and tells you what is still missing.

## 0.6.56 — 2026-11-22
- Changed: when you open Kiki, the intro now stops on Ms. Kiki's portrait instead of jumping straight into the app. Click anywhere or press any key to go in. Reconnecting, or turning the intro off, still goes straight in.
- Added: a portrait collection wall on that page. Like a daily contribution grid, it has 144 squares (24 hours × every 10 minutes); every portrait you have seen lights up its square with her face, and today's one is highlighted. See them all to fill the wall.

## 0.6.55 — 2026-11-22
- Fixed: the AI Data Export Mac helper no longer calls its zip "OK to share". Images, large files and Codex attachments are copied as-is without hiding secrets, so the zip is now named "tidied export", the done screen and the read-me-first guide say to check attachments and chats before sharing, and a list of every file that wasn't scrubbed is included.

## 0.6.54 — 2026-11-22
- Fixed: on the Kiki page, the top of Kiki's head was cut off. All 13 time-of-day outfits now show her whole head with a little space above it, at every window size from narrow windows to 4K and ultrawide screens.

## 0.6.53 — 2026-11-21
- Added: the Space overview is now a wall of modules built around your tasks. Every project gets a block with a one-line summary, and each task you handed over shows a step chain: what is done, what is running, where it is waiting on you, and what failed. Click any step to open that conversation.
- Added: new modules on the wall, including Main things, Suggested next steps, What to handle first, Risks, Goal progress, Still today, Due tomorrow, Done today, While you were away, Just happened, Project timeline, My timeline, All schedules, Tools overview and a Launcher for your other AI apps. A few (Review advice, Tracked numbers) are placeholders that say what they still need.
- Improved: the overview now fills 4K and ultrawide screens instead of sitting in a narrow strip. Laptops show the core modules, 2K adds more, and 4K and ultrawide show everything.
- Added: a Modules button at the top right of Space lets you turn each module on or off for the screen you are on, or switch back to the old three-column overview.

## 0.6.52 — 2026-11-21
- Improved: the AI Data Export Mac helper (kikibao.com/banjia) now opens a proper window in the new Kiki look, following your Mac's light or dark mode. It shows what it found from Claude Code and Codex before you start, live progress while it works, and clear next steps when it's done.
- Improved: everything now lands in one folder in your Downloads folder: a "read me first" guide on top, the tidied-up Markdown, a ready-to-share zip, and the untouched original backup (marked not to share).

## 0.6.51 — 2026-11-21
- Fixed: Settings › Toolbox used to show one big "tokens every turn" number that added up every always-on tool and skill on the computer, so it looked like every chat carried all of it. It now shows what each kind of chat really sends to the model every turn (Kiki's main chat, members' work chats, members' main chats), measured from the latest real request, split into tool descriptions and system prompt.

## 0.6.50 — 2026-11-21
- Fixed: Kiki's main conversation no longer shows the internal notes meant for the AI (for example "This came from…", "…said this is not theirs", or "Everything for the user's message has ended…"). Scheduled jobs now show as a single small line saying where they came from.
- Fixed: when no team member fits a request, Kiki now hands it to HR, who asks whether you'd like to hire someone, instead of failing with "nobody can do it". HR and a member's own scheduled jobs can no longer be turned down as "not mine".
- Improved: when you say something new and Kiki asks a new question, the older unanswered question card in Kiki's conversation is closed, so only the latest one stays.

## 0.6.49 — 2026-11-21
- Fixed: while Kiki updated itself in the background, the "Update available" line in Space could still be clicked and pulled you into Settings. Background updates now never take you away from what you're doing: that line just says the update is installing, and progress stays in the sidebar.

## 0.6.48 — 2026-11-21
- Added: team members now carry tags, such as which product they work on and what kind of work they do (for example "Project: Kiki" and "Role: Promotion"). HR picks the tags when hiring, Kiki sees them when deciding who gets a job, so several members working on the same product no longer get mixed up.
- Added: tags come from one shared list. Every member needs at least a project tag and a role tag ("General" is fine), and new tags are checked against existing ones so near-duplicates don't pile up. Existing members count as "General" until HR suggests better tags.

## 0.6.47 — 2026-11-21
- Fixed: the 0.6.46 build didn't finish, so its Antigravity cloud projects support ships in this version instead.

## 0.6.46 — 2026-11-21
- Added: Antigravity cloud projects (Remote Agents) can report to Kiki too. The "Connect cloud" card now gives you one line to paste at the top of your Antigravity project's Setup script. After that, remote conversations show up as cards when you give them a task and when they finish, and clicking a card opens that conversation in Antigravity. Antigravity doesn't offer hooks for remote conversations, so Kiki asks the agent to report in; it may occasionally miss one.

## 0.6.45 — 2026-11-21
- Improved: the Space "Now" view now aligns all three columns evenly with no empty gaps between blocks, expands cleanly on wide screens, moves External inputs into the left column with Show more/less, and arranges Learned today in a compact horizontal strip along the bottom.
- Improved: every block in Space "Now" now shares uniform header heights, plain monospace counts, consistent row layout with right-aligned timestamps, three-tone status labels (orange for waiting on you, red for errors, neutral gray for everything else), and cleaner neutral cards under Needs you.

## 0.6.44 — 2026-11-21
- Fixed: on ultrawide screens, the full-page Kiki view now keeps Kiki, the review desk and the top bar together in the middle of the screen instead of pushing them to the far corners. The scene background still fills the whole screen.

## 0.6.43 — 2026-11-21
- Added: Antigravity now reports to Kiki like Claude Code does. Turn it on under external agents, and conversations from the Antigravity app, Antigravity IDE and the `agy` command line each show up as a card when they start and finish. Clicking a card for an `agy` conversation reopens it in Terminal. For a conversation from the app or IDE, it brings Antigravity to the front so you can pick the conversation from its list.

## 0.6.42 — 2026-11-21
- Improved: the Space "Now" view has been redesigned as a three-column dashboard. At the top, Kiki's brief summarizes what finished, what needs you, and what is running, paired with four clickable counters (Need you, Working, Done today, Spent today) that filter the view to that category.
- Added: live blocks across Space for Needs you (with quick approve/reply actions), Your to-dos, Working now (with live steps and Stop), Up next (routines and cloud schedules with Run now and Pause), Done today (including outputs and Review Desk items), Team status and pending handoffs (click any member to jump straight to their profile), Health alerts, Spending breakdown, Learned today, and External inputs. Quiet blocks automatically collapse to a single line so nothing clutters the screen.

## 0.6.41 — 2026-11-21
- Added: members can now work with Antigravity CLI (Google's `agy`) on your computer, using your Google account. Pick it under "Who does the work" in Settings › Models or in a member's settings. Kiki runs it in the background with no terminal window, the member can use Kiki's tools, and when it wants to do something your Antigravity permission rules don't allow, it stops and asks you first.

## 0.6.40 — 2026-11-21
- Fixed: on the full-page Kiki view, double-clicking Approve no longer sends the decision right away. It waits the same 5 seconds, so Undo still works.
- Fixed: if you close or reload the window during those 5 seconds, your decision is still delivered instead of getting lost.

## 0.6.39 — 2026-11-21
- Fixed: in Space › Members, a member's page shows again what they handed to other members and what was handed to them, with how long each has been waiting, plus their paused schedules, which you can resume right there.

## 0.6.38 — 2026-11-21
- Added: on the full-page Kiki view, clicked the wrong button on a card? After you approve, decline or finish a card, a bar at the bottom lets you undo it for 5 seconds. Nothing is sent until those 5 seconds are up.
- Added: a "Today" button at the top of the Kiki view lists everything you handled on the desk today. Open any item to see the original, or jump to Space to see everything done today.

## 0.6.37 — 2026-11-21
- Improved: the chat page, sidebar, right panel, Settings, and dialogs now share the same refined look as the full-page Kiki and Space views—warm cinema-style lighting when Kiki is on screen, and crisp ceramic-and-ink surfaces when she is off—with pure black dark mode and consistent light mode contrast across every panel.
- Improved: cards, task boards, document previews, and confirmation dialogs have clearer depth and spacing, recessed input fields, and unified button styling.
- Improved: Kiki's full-page view and Space page have cleaner light-mode shadows, sharper selection indicators, and more readable status tags.
- Fixed: team member avatars now consistently use the official tilted-square icon across all built-in themes, and the Appearance preview thumbnails in Settings now show the current orange and neutral palettes instead of legacy colors.

## 0.6.36 — 2026-11-21
- Improved: your team now lives in Space. Space has a new Team tab next to Now and History: "Me" sits at the top, where you write About me, then every team member with their status. Hire and the Talent Store are at the top of the list.
- Added: each team member shows a "Skills & tools" block, both in Space › Team and in the member's side panel. Tick which library skills and MCP servers that member can use, right where you use them. The machine-wide Toolbox stays in Settings.
- Improved: Settings no longer has the Team members and About me pages. Old links to them now open Space › Team.

## 0.6.35 — 2026-11-21
- Improved: Settings is tidier. The sidebar is now grouped into General (language, what to call you, Mac permissions, optional downloads, appearance, remote access), AI setup (models, providers, browsers, capabilities, auto-approve, usage) and Inside Kiki (team members, toolbox, about me). Pages that overlapped were merged: MCP servers and pi extensions now live in Toolbox, Kiki's built-in switches have their own Capabilities page, and the Talent Store link sits at the top of Team members. Old links still open the right spot.
- Improved: "Full auto" is now called "Auto-approve", which says better what it does.
- Removed: the "When unsure, send to" setting, which no longer did anything. The Kiki Portal page is hidden from the sidebar until membership opens.

## 0.6.34 — 2026-11-20
- Improved: the full-page Kiki view now has a review desk. Everything that needs your decision sits in a pile on the right, and you approve, decline or put off the top card right there with a stamp. Cards are sorted into Kiki's three places (Work, HQ and Life). When you clear one place, Kiki says so and walks you to the next. What she says now appears in a speech bubble next to her.
- Added: the first time you open Kiki, she asks whether you want her on screen. Pick "Yes" for the character look, with full-page Kiki and the review desk in a warm, cinema-style night palette. Pick "No" for a simple look: just the logo, warm grey surfaces and small status lights. You can switch anytime in Settings › Appearance ("Kiki on stage").
- Added: eight new built-in themes, each in light and dark: Monocle Press, Swiss Grid, Kyoto Study, Arch Studio, Frosted Air, Flight Deck, Executive Desk and Pure Monolith. Pick one in Settings › Appearance; they keep the new layout and full-page Kiki.
- Improved: the Space page is simpler. A row of counts at the top (All, Waiting, Errors, In progress, Done today) filters the list when you click one. On the left, everything in progress is listed one per row, most urgent first. Click one and the right side shows its summary and the buttons you can press. A Now / History switch at the top right shows the timeline of what happened. "While you were away", "Suggested for you", "Just happened", plugin cards and the toolbox summary are gone from this page.

## 0.6.33 — 2026-11-20
- Added: after a pull request a team member opened is merged or closed, and the member has nothing more to add, Kiki now hands in the job for them so it moves to Done without any nudging. It only does this when that conversation isn't watching any other pull request. You can turn it off in Settings › Capabilities ("Hand in after a PR merges").

## 0.6.32 — 2026-11-20
- Added "Auto-merge when ready" to the CI monitor popover. It is off by default. Turn it on for a pull request and Kiki merges it for you (squash) once every check has passed, GitHub says it can merge, and nobody has asked for changes. Nothing needs to be set up in your repository. If the pull request falls behind and has conflicts, the team member who opened it brings in the latest changes and Kiki tries again. Repositories without any checks are never auto-merged.
- Added a "Merge now" button to the CI monitor popover when a pull request is ready to merge. If it can't be merged, the popover tells you why.

## 0.6.31 — 2026-11-20
- Added Amp as a client for team members: if Amp is installed and signed in on this computer, you can pick "Amp on your computer" for a single member or as the default for team members. Kiki runs one Amp turn at a time in the background with no terminal window, keeps each conversation going in the same Amp thread, and gives it Kiki's tools without changing your Amp settings. Amp has no official way to add extra instructions or to ask before each step, so Kiki puts its instructions at the start of each new conversation, and Amp works without stopping for permission whatever permission level you pick.

## 0.6.30 — 2026-11-20
- Added Crush as a client for team members: if Crush is installed and has a model set up on this computer, you can pick "Crush on your computer" for a single member or as the default for team members. Kiki runs it in the background with no terminal window, uses the models you set up in Crush, gives it Kiki's tools without changing your own Crush settings, and asks you whenever Crush wants permission for a step. Crush has no official way to add extra instructions, so Kiki puts its instructions at the start of each new conversation.

## 0.6.29 — 2026-11-20
- Added: a "View on the web" link next to "Show full history" in Settings › Software Update. It opens the full changelog on getkiki.ai/changelog, right at the version you are running.

## 0.6.28 — 2026-11-20
- Changed: Kiki now ships with just two looks, light and dark, each with the Kiki character on or off. The Miracle look is gone; if you were using it, Kiki switches you to light.
- Changed: the Tower, Eyes and Sticker looks moved to Talent (Settings › Talent) as installable themes. If you used one and install it from Talent, it keeps working; otherwise Kiki switches you to its light or dark base. As installable themes they no longer change the Dock icon, and Sticker no longer turns team members into objects.

## 0.6.27 — 2026-11-20
- Added Devin for Terminal as a client for team members: if Devin is installed and signed in on this computer, you can pick "Devin on your computer" for a single member or as the default for team members. Kiki runs it in the background through Devin's official editor interface, with no terminal window, gives it Kiki's tools without changing your Devin settings, and asks you whenever Devin wants permission for a step. Devin has no official way to add extra instructions, so Kiki puts its instructions at the start of each new conversation.

## 0.6.26 — 2026-11-20
- Improved: Kiki's three built-in members, HR, the Archivist (keeps what you ask Kiki to remember) and Ops, now sit together in a small "Kiki's crew" box under Kiki's card, each with a one-line hint and a dot when something needs you. They no longer mix with your own team list.

## 0.6.25 — 2026-11-20
- Fixed: when a team member whose engine has no read-only mode (such as Codex or Cursor) continues an earlier conversation on a job that needs a plan first, the plan now reaches you on a plan card instead of the job getting stuck.
- Fixed: if you ask to see a plan first and Kiki hands the request to a conversation that is busy with something else, it no longer gets folded into that other job. It waits its turn and starts with a plan for you to approve.
- Fixed: the weekly routing review has something to learn from again. Each time Kiki hands your request to a team member it is noted, and when a member says a job isn't theirs and it goes to someone else, that counts as a correction. With fewer than three corrections the review is skipped instead of starting a job for nothing.
- Fixed: question cards and plan cards no longer show up as extra jobs, with their own cost, in job counts.

## 0.6.24 — 2026-11-20
- Improved: when several updates from your team arrive together, Kiki now opens with one or two sentences saying what needs you and what got done, with the full updates folded underneath.
- Added: Kiki notices when you've been away from it for 10 minutes. While you're away, routine updates wait and arrive as one "While you were away" message when you come back; urgent ones still show up right away and are also sent to your connected chat channels (such as WeChat).

## 0.6.23 — 2026-11-20
- Added: a CI monitor for pull requests your team members open. A small badge next to the chat title shows whether the checks are running, passed or failed; click it to see how many checks are in each state, what happened last, and to stop watching the PR. The side panel lists every pull request Kiki is watching.
- Added: an "Auto-fix CI and handle comments" switch for each pull request. On (the default), the member fixes failing checks and review comments itself. Off, you just get a note in your inbox and the member leaves the pull request alone.

## 0.6.22 — 2026-11-20
- Added Kilo Code CLI as a client for team members: if Kilo is installed and signed in on this computer, you can pick "Kilo on your computer" for a single member or as the default for team members. Kiki runs it in the background with no terminal window, gives it Kiki's tools and rules without writing anything into your project, and asks you whenever Kilo wants permission for a step.

## 0.6.21 — 2026-11-20
- Improved: a new look for conversations in the Light and Dark appearances. Your messages sit on a light strip instead of a bubble, tables only keep row lines, every card shares one clean style, and times and numbers use a monospace font. Kiki now ships its own Inter and JetBrains Mono fonts for this (Chinese text still uses the system font).
- Improved: the four columns now split the screen by the golden ratio. Click the main conversation or the task opened next to it, and that one gets the wider space while the other narrows a little.
- You can switch back to the classic look in Settings › Appearance by turning off "New look".

## 0.6.20 — 2026-11-20
- Added Qoder CLI as a client for team members: if Qoder CLI is installed and signed in on this computer, you can pick "Qoder on your computer" for a single member or as the default for team members. It runs in its own terminal with your Qoder account, follows Kiki's rules, and can use Kiki's tools such as the browser, without writing anything into your project. All four permission levels work. Kiki itself can't use Qoder yet.

## 0.6.19 — 2026-11-20
- Improved: on Mac, commands that team members run now go through the system sandbox. They can't read Kiki's own program files or your keys, and can't write into other members' folders, however the command is written. Your API keys are no longer passed to members' commands; to give a member a key, list its name in KIKI_MEMBER_ENV in Kiki's .env file.
- Improved: Kiki's new way of handing out work is now the only one and is always on. Every step of a job is written down before it happens, so after a restart Kiki picks up where it left off without opening a conversation twice or sending the same message again.
- Fixed: a job that stops halfway (no reply for a long time, or the conversation ended without handing in) is now redone in a fresh conversation instead of being dropped. A conversation that is busy or waiting on a timer is no longer treated as stuck, and the time Kiki was closed doesn't count either.
- Fixed: when Kiki asks you a question and you answer, Kiki now picks the same request back up with your answer and hands it on right away, without handing out the parts it already passed on a second time. Before, it sometimes said it couldn't start the task.
- Added: jobs can have a deadline. If a job isn't finished in time it is stopped, any question cards it left are taken down, and whatever was already done is still reported to you. Tapping an old card just tells you the job has passed its deadline.
- Improved: a team member that says "wake me later" now waits quietly without being treated as stuck, and picks the job back up when the time comes or the thing it waited for happens.
- Added: team members can now set their own schedules. Ask for "every morning at 9, send me the report" and the member doing it sets the schedule itself, or a one-off time, or a webhook. You can see and stop them on the board as before.
- Improved: scheduled jobs, webhook jobs and background jobs now run the same way as everything else you ask for. They survive a restart instead of showing as interrupted, a job missed while Kiki was closed runs once when it starts again, and the same webhook delivered twice only starts one job. Each run gets the previous run's result.
- Improved: everything that wakes a team member up (a timer it set, news on a pull request it opened, a reply to something it is watching, or you tapping "Do it" on a suggestion) is now recorded as part of a job. If the member is busy with something else, the new item waits its turn instead of interrupting, and a member that already finished the job is not woken again by a late timer.
- Improved: a team member can't keep a job open forever by waiting over and over. After 12 waits or a full day of waiting, further waits are refused and the member is told to set a repeating schedule instead. A member waiting on two things at once is woken for each and keeps waiting for the other, and after Kiki has been closed for a while the member gets what it was actually waiting for rather than a plain "time's up".
- Fixed: when a team member is woken up (a timer, news on its pull request, a suggestion you approved), the result now reaches you, and the new job no longer lands in the member's main chat with you. News from outside that reaches Kiki is no longer treated as something you typed.
- Fixed: scheduled jobs use the model you picked for them again, and a schedule a team member set up for you no longer counts its own text as your words when deciding what needs your approval.
- Improved: a team member can only stop the schedules it set itself, and setting the same schedule twice no longer creates two.
- Fixed: if you approve a step while the team member is still finishing its previous reply and Kiki restarts right then, your approval is delivered after the restart instead of being lost and leaving the job stuck.
- Fixed: a question card a team member shows just before Kiki restarts still works after the restart. Tapping it answers the card instead of being passed along as a loose message, and the member waits for your answer instead of carrying on.
- Fixed: when a schedule a team member set up for you comes due, the member now does the job instead of thinking it is still being asked to set the schedule up.
- Added: a built-in Archivist team member. When you say "remember…" it goes to the Archivist, and Kiki's daily direction check, nightly job review and weekly routing review are now jobs for the Archivist. Kiki gathers the facts for each one and hands them over with the job, so the Archivist never needs to open your other chats or Kiki's records. Your existing schedules move over to it without being duplicated, and a schedule you made yourself with the same name is left alone. The Archivist can't be deleted. It can update your roadmap when it writes the overview board, and the model you pick for "Reviews and suggestions" in Settings is the one it uses for the daily direction check. The nightly job review is skipped on days with no jobs or nothing that went wrong. If the Archivist's folder is missing, Kiki does the three reviews on its own as before.
- Improved: "wait for these jobs first" and job deadlines now go through the same system as all other work, and the old once-a-minute check for overdue jobs is gone. Background jobs from an older version that hadn't started yet are picked up again after the update; ones that were halfway through are stopped and listed in the restart notice, so just ask again if you still need them.
- Improved: a background job on the board now shows the job it started and follows it, showing done, failed or cancelled when that job ends, and stopping it on the board stops the job too. Schedules that belong to Kiki itself are handed out by Kiki instead of Kiki doing the work. If a daily review gets an unreadable answer from the model, Kiki asks once more and otherwise tells you plainly that it will try again next time.
- Improved: every turn a team member takes is now tied to a job. Helpers a member sends off, approval results and answers to question cards all go through the same path, so nothing can start work behind Kiki's back, and an answer you give on a card is delivered exactly once.
- Fixed: when a team member sends a helper off in the background, the helper's report now comes back to the same job and the member picks it up there, instead of being nudged to hand in early and the report turning into a separate job. An approval left waiting from an older version is no longer lost after the update.
- Added: for big jobs you give face to face that change your own things (your product's code or design, a document others rely on, a system setting), the team member first sends you a plan in three parts: how things are now, what it will change, and how you can tell it's done. Until you approve the plan on its card it can only look around, not change anything; asking for changes sends it back with your note, and declining cancels the job. Errands, research, scheduled jobs and webhook jobs never stop for a plan. You can turn this off in Settings › Capabilities.
- Fixed: answers to a team member's question card now always reach it, even if Kiki restarted in between, and a card left over from a job that already finished no longer gets attached to the member's next job.
- Improved: the nightly job review now also looks at jobs that got stuck and were rescued, and the daily direction check keeps the previous version of your roadmap and refuses an update that would drop items you wrote.
- Fixed: when two of Kiki's question cards are open at once, tapping a button on one now answers that card, not the other one. Typing something that isn't one of the options no longer counts as answering the first card.
- Improved: what you type on Kiki's page, messages from chat channels and messages from outside agents all go through the same front door now, so they are handled the same way.
- Improved: when two jobs need the same browser, the second one now waits its turn and is told when the browser is free, and the wait survives a restart. A job that stops to wait for you lets the browser go so others aren't held up, and two jobs that would end up waiting on each other are stopped from doing so. The board shows who is using each browser and how many jobs are waiting.
- Improved: each job a team member gets now lists related work going on right now, such as other members' parts of the same request and who is using a browser, so members don't redo each other's work.
- Improved: team members can no longer read other members' or Kiki's conversations, deleted or archived chats, or Kiki's internal records. Kiki's data folder is closed to members except for their own folders, your uploads, skills and a few shared settings. Everything a member needs comes with the job it is given, and it can still look back at its own earlier conversations. Looking up jobs or background tasks only shows that member's own. When a job comes with a webhook delivery or another job's result, the file is copied into that member's own folder so it can open it, and other members can't see the copy. HR's daily look back at yesterday's conversations no longer opens your chats to HR: Kiki gathers everything you said that day, in full and grouped by who handled it, and makes the suggestion cards itself, and HR only acts on the ones you approve. Kiki's own reminders and messages from outside no longer count as things you said.
- Changed: the experimental switches for the new Kiki, new work conversations, new member pages, one job per conversation and the dispatch clerk are gone from Settings. Their behavior is now the default, and old saved values are ignored.
- Changed: commands that start with "/" on Kiki's page are gone. Just tell Kiki what you need.
- Improved: when one request needs several team members, each one now gets only its own part, so work is no longer done twice.
- Improved: when a team member needs another member's help, Kiki now passes the request on and the first member waits for the result before reporting to you, instead of reporting early.
- Improved: when a team member is stuck because it needs something another member has, Kiki now fetches it and the member picks the job back up on its own.
- Improved: team members now hand in each job the same way: a short conclusion, the files, what is missing if they are stuck, and anything else they noticed.
- Improved: HR now has to write what a new member does not do before creating it, and new members start with only the MCP servers HR names for them.
- Improved: every Kiki reply now ends with a real action, either handing the work to a team member or answering you directly. The "Handed to …" line you see is written by Kiki's app from the actual handoff, so Kiki can no longer say it passed something on when it didn't.
- Improved: when something needs your account, a code or a photo and no team member handles that kind of work, Kiki asks you for it first and offers to hire someone, with buttons to tap.
- Improved: background jobs are named by what they do, without the "bg-" prefix, and HR's daily and weekly checkups have plain names such as "Review yesterday's chats".
- Fixed results of two jobs getting mixed up when a team member received several at once: each job now carries your own words for that job only.
- Fixed a new message to Kiki being folded into the job Kiki was still handing off. It now waits its turn and becomes its own job. You can still type into a working conversation to steer it, and Stop still works right away.
- Fixed Kiki sometimes repeating itself after handing work off, or showing a stray English line.
- Improved: HR and the setup assistant now handle each job in its own conversation. Each member HR creates gets its own conversation you can go back to for changes, and one job waiting on you no longer holds up the rest. HR's suggestion cards appear right away in the conversation that made them.
- Improved: team members can no longer read or change Kiki's own program files, its internal settings or your saved keys, and can only change their own folder (HR can still edit any member).
- Improved: if Kiki restarts while requests are in progress, it now picks them up where they left off instead of dropping them, including jobs waiting on your answer or on another member. It only tells you about the few it can't continue.
- Fixed a stuck job waiting forever when the missing piece is something only you have: the member now asks you directly.
- Improved Kiki (new version): what you say on Kiki's page and through connected chat apps now goes through the same new flow as everywhere else, so every request is tracked the same way.
- Fixed a new message being taken as the answer to a question card Kiki had left open. In Kiki's chat, tap a button on the card to answer it; anything you type becomes a new request.
- Fixed Kiki stopping the wrong job. Kiki now stops only the job you name, or the one it just handed off for that message.
- Fixed HR getting stuck after suggesting a new team member, which left later requests to HR waiting forever.
- Improved safety: team members can no longer open their own browser behind the scenes to work on websites. Websites go through the Kiki browser extension, where you can see what happens. This also covers skills HR installs for a member: a website skill now uses the Kiki browser extension instead of driving Chrome itself.
- Changed: when a team member is missing an ability, HR now only installs ready-made tools and skills. If nothing fits, the member writes the skill itself and keeps it in its own folder.
- Fixed a team member's main conversation sometimes not being saved, so its list of jobs was lost after a restart.
- Fixed a job with several parts being done more than once when team members passed results back and forth.
- Fixed typing an answer to a question card that has no buttons: your reply now answers the question instead of starting a new job.
- Fixed a job going to the wrong place after you approved a new team member: the new member now picks up the job you asked for, with your own words.
- Improved safety: every team member, including ones HR creates, is told to use the Kiki browser extension for websites and not to look around your computer's running apps. Commands that list every app running on your computer, or search them for a browser, are now blocked.
- Fixed a job Kiki gave to HR (or another built-in member) by mistake going nowhere. When they say it isn't theirs, Kiki now hands it to the right member. A member who said a job isn't theirs won't get the same job again, and if two members both say no, Kiki asks you who should take it.

## 0.6.18 — 2026-11-20
- Added Factory Droid as a client for team members: if Droid is installed and signed in on this computer, you can pick it as the default for team members or for a single member. It runs in a terminal like Claude Code, supports all four permission levels, can use Kiki's tools such as the browser, and Kiki adds its own instructions and tools without writing any files into your project. Kiki itself can't use Droid yet.

## 0.6.17 — 2026-11-20
- Added Settings › Report a Problem: write one line about what went wrong and press Submit. Kiki attaches your version, system and recent logs, with keys, your username, computer name, emails and chat content removed first, and sends it to the developer. No account needed. You can open "See what's included" to read every line, untick parts, or copy or save the report instead.

## 0.6.15 — 2026-11-20
- Added Cursor as a client for team members, through Cursor's official SDK: pick it as the default for team members or for a single member, then use "Sign in to Cursor" in Settings › Models to sign in with your Cursor account. The SDK downloads on first use (about 45MB, listed in Settings › Extensions where you can remove it). Kiki runs it in the background with no terminal window and writes nothing into your project. With "Everything automatic" it works as usual; every other permission level runs inside Cursor's sandbox. Branched conversations start fresh, and Kiki itself can't use Cursor yet.

## 0.6.14 — 2026-11-19
- Improved: team members now think at a medium level instead of high, so everyday work comes back faster and uses fewer tokens.

## 0.6.13 — 2026-11-19
- Improved: team members' own skills now live in one skill library. In Settings › Toolbox you can open any library skill and tick which members can use it, just like browsers. Skills your members already had are moved in automatically (a backup of each member's old folder is kept).
- Improved: when a member edits a skill that other members also use, Kiki saves a separate copy for that member first, so the others keep the original.
- Improved: sharing a member still packs the skills assigned to it, and importing one puts its skills into your library for the new member.

## 0.6.12 — 2026-11-19
- Added Gemini CLI as a client for team members: if Gemini CLI is installed and signed in on this computer, you can pick it as the default for team members or for a single member. It runs in a terminal like Claude Code, can use Kiki's tools such as the browser, and Kiki adds its own instructions and tools without writing any files into your project. Branched conversations start fresh, and Kiki itself can't use Gemini CLI yet.

## 0.6.11 — 2026-11-19
- Added OpenCode (OpenCode 2) as a client for team members: if OpenCode is installed and signed in to a model on this computer, you can pick it as the default for team members or for a single member. Kiki runs it in the background through OpenCode's own server, with no terminal window, and the conversations also show up in your own OpenCode. Kiki itself can't use OpenCode yet.

## 0.6.10 — 2026-11-19
- Added the DeepSeek Harness edition: install the Kiki plugin in DeepSeek Harness and it can install Kiki for you. Kiki installed this way gives new team members DeepSeek Harness by default and uses the DeepSeek Harness already on your computer, so there's no 1 GB download.

## 0.6.9 — 2026-11-19
- Fixed Copilot showing as signed in when it only had a token in Kiki's own settings, which the Copilot window can't use. Copilot now shows as ready only after you've run `copilot login` on this computer.

## 0.6.8 — 2026-11-19
- Added Copilot (GitHub Copilot CLI) as a client: if Copilot is installed and signed in on this computer, you can pick it for Kiki, as the default for team members, or for a single member. It runs in herdr with your GitHub Copilot subscription. Copilot has no way to branch a conversation from the command line, so a branched conversation starts fresh.

## 0.6.7 — 2026-11-19
- Added Kimi Code (Moonshot AI's Kimi Code CLI) as a client: if Kimi Code is installed and signed in on this computer, you can pick it for Kiki, as the default for team members, or for a single member. It runs in herdr with its own sign-in. Kimi Code has no way to branch a conversation from the command line, so a branched conversation starts fresh.

## 0.6.6 — 2026-11-19
- Added Grok (xAI's Grok Build CLI) as a client: if Grok is installed and signed in on this computer, you can pick it as the default for team members or for a single member. It runs in herdr with its own sign-in. For now Grok can't be Kiki's own client, and Grok members can't use Kiki's browser and other Kiki tools, because Grok has no official way to attach them per session.

## 0.6.5 — 2026-11-19
- Added Qwen Code as a client: if Qwen Code is installed and signed in on this computer, you can pick it for Kiki, as the default for team members, or for a single member. It runs in herdr with its own sign-in, just like Claude Code and Codex.

## 0.6.4 — 2026-11-19
- Added "Who does the work" at the top of Settings › Models: pick which client Kiki uses (built-in, Claude Code or Codex) and which client team members use by default (also DeepSeek Harness). Each member can still pick their own in their settings.
- Added a list of the command-line agents found on this computer and whether each is signed in, so you can see what's ready to use.
- Added Codex as Kiki's brain: if Codex is signed in on this computer, you can pick it on the first-run screen or in Settings, no API key needed.

## 0.6.3 — 2026-11-19
- Fixed a team member's conversation getting stuck forever when a file search ran over a huge folder. Searches now stop after 60 seconds and the member is told to narrow the folder or ask you where the file is.
- Fixed follow-ups not reaching the job they belong to: each job a team member is handling now shows your own words as its name, so Kiki can tell them apart.
- Fixed tasks on the board sometimes showing under the wrong job when a team member had several jobs lined up.
- If Kiki is asked to actually hand off a job it said it handed off, and still doesn't, you now see a note that it wasn't handed off.

## 0.6.2 — 2026-11-19
- Added: Codex members can now work on another computer you added to herdr, just like Claude Code members. Pick the computer in the member's settings and Kiki starts Codex there with that computer's own install and sign-in, copies the conversation back over ssh, and picks the same conversation up again after Kiki restarts.

## 0.6.1 — 2026-11-19
- Improved the Office, now called Space: everything is on one page of panels. On a big screen the timeline fills the left column and the other panels sit on the right, and on a laptop they stack. Panels include what needs you, who's working, while you were away, Kiki's suggestions, each agent's status, recent events, plugins, the toolbox and a timeline of what happened before.
- Improved agent details in Space: click an agent to filter what needs you and what's running, and see its handoffs right below.
- Improved settings: the Toolbox now has its own page in Settings › Toolbox, and plugin pages like Usage are also listed under Settings › Extensions.

## 0.6.0 — 2026-11-18
- Added a full-page Kiki home. Clicking Kiki now shows her standing in front of you with her words as subtitles and one box to talk to her. A small map shows where she is (HQ, work, life), and she walks to work while your team works, standing next to whoever is handling your request. Your full conversation opens from "Log", and the sidebar, team and boards are in "Space" for when you want the details. Only in the default light and dark looks with the character on.

## 0.5.101 — 2026-11-18
- Fixed team members mixing up jobs when they handle several at once. Every message in a member's main conversation is now tagged with its job, and the member only sees that job's messages while working on it, so answers and results no longer end up in the wrong job. When you follow up on a job through Kiki, or type to the member directly, Kiki files the message under that same job.

## 0.5.100 — 2026-11-18
- Fixed getting stuck on the invite code page after choosing "Run on this Mac" by mistake. A new link at the bottom takes you back to pick where Kiki runs, so you can connect to Kiki on another computer instead.

## 0.5.99 — 2026-11-18
- Fixed Kiki saying a job was handed off when it wasn't. If Kiki says it handed something off but no task was opened, Kiki is told to hand it off for real or say plainly that it didn't, and you see a note if it still didn't.
- Approvals now only count when you press Approve or Reject on the question card. A typed reply is passed back to the team member as feedback, not as a yes.
- Added "Write outside" to Autonomy: by default a team member asks you before saving files outside its own folder or a folder you named in your message.
- Kiki can now only hand work to a team member, an existing conversation or HR. A name that isn't on your team is sent back for Kiki to fix instead of being guessed.
- Added routing rules: write lines like "- Xiaohongshu, post → Marketing" in routes.md in your Kiki folder, and messages with those words go to that member. Hiring requests go to HR by default.
- Team members now get only your words, what counts as done and the last few turns when Kiki hands them a job, not the unrelated history Kiki used to decide who gets it.

## 0.5.98 — 2026-11-18
- Improved connecting Claude Code on claude.ai (cloud): Kiki now shows a step-by-step card with copy buttons for the allowed domains, the token line and the setup script, so you don't have to pick them out of a chat message.
- Improved Ops: steps you need to do now go in its final reply instead of its collapsed working notes.
- Fixed Kiki turning down jobs like signing in, booking or filling in a code because it can't do them itself. It now hands them to a team member, who asks you for what's missing.
- When you ask to see a plan first, the team member now asks for your OK with a question card instead of a line in its reply.
- Kiki now replies in the language you write in.
- Fixed "needs you" cards for coding agents popping up while the agent was still working. Kiki now waits 10 seconds after the agent stops, skips the card if it's just waiting on a background job, tests or CI, and takes back a "done" card when the agent picks up work again. Approval requests still pop up right away.

## 0.5.97 — 2026-11-18
- Removed the Desk and Incoming Call ways of talking with Kiki. Kiki's chat is now always the regular conversation view, and the switcher button in the top bar is gone.

## 0.5.96 — 2026-11-18
- Added: in English, Kiki's spoken lines on the front screen and the splash screen are now in English, and so are the desk pet's bubbles and right-click menu, including outfit names. Changing the language while the desk pet is open updates it right away.
- Improved: the installer window now speaks English.
- Fixed: a few labels and tooltips that were still showing Chinese in the English interface.

## 0.5.95 — 2026-11-18
- Added: a Claude Code agent can now work on another computer. Add the computer to herdr once (`herdr machine add <ssh host>` in Terminal), then in the agent's settings pick it under "Which computer" and give a folder on that computer. The agent uses the Claude Code installed and signed in there, and Kiki shows its answers and approval requests as usual.
- Fixed: when Claude Code can't reach its API (for example it isn't signed in), Kiki now shows the error instead of waiting.

## 0.5.94 — 2026-11-18
- Added full conversation history for Claude Code and Codex: Kiki now keeps the whole conversation, not just the last reply. That includes what you said, what the agent said, every step it took and the start and end of each tool result. This covers sessions on Kiki's computer and claude.ai cloud project threads. Your agents can read it when you ask what happened in a conversation.
- Fixed Chinese text from external agents sometimes arriving garbled when a report was large.

## 0.5.93 — 2026-11-18
- Added English versions of the built-in member descriptions, routing rules, About Me, vision and roadmap. New installs get them in English, and switching the language swaps any of these files you haven't edited.
- Improved member descriptions: section headings can be written in English or Chinese, and Kiki reads both.
- Fixed the update screen sometimes showing English when the interface is set to Chinese.

## 0.5.92 — 2026-11-18
- Added Delete and Delete all to the archive shelf, so members you won't bring back can be cleared out. Their paused schedules are cancelled too.
- Fixed the new Kiki sometimes saying a job was handed off when it wasn't. It now says so plainly when a handoff fails.
- Improved HR: when it needs something only you have, like an account or a photo, it asks you with a question card instead of just waiting.

## 0.5.91 — 2026-11-18
- Added Codex as an engine for your agents: in an agent's settings, under "Who does the work", choose "Codex on your computer" to have that agent work with your own Codex and ChatGPT subscription. Like Claude Code, it runs inside Kiki's built-in herdr, keeps going when Kiki restarts, and asks you before steps that need approval.

## 0.5.90 — 2026-11-18
- Improved: more of Kiki is in English: the office floor plan, timeline, toolbox, scheduled runs, usage and the update screen. Built-in agents now show English names (Ops, Usage).

## 0.5.89 — 2026-11-18
- Added: Kiki now comes in English. New installs start in English; if you're upgrading, Kiki stays in Chinese.
- Added: switch the language with the language toggle on the welcome screen, in Settings › About me › Language, or just ask Kiki in chat ("switch to Chinese"). The one setting changes both the interface and the language Kiki and your agents reply in, and the window and menu bar switch right away.
- Pick another reply language (Japanese, Spanish, …) in Settings and Kiki answers in it while the interface stays English.

## 0.5.88 — 2026-11-18
- Improved: confirmations and error messages (deleting a task, clearing a chat, uninstalling an extension, removing a browser or MCP server, and more) now use Kiki's own dialog instead of the system pop-up. Destructive actions get a red button that says what it does, and it looks right in both light and dark mode.

## 0.5.87 — 2026-11-18
- Added release history: Settings › Software Update shows what's new in every version since yours, plus the full history. Release notes on GitHub now list the changes too.
- The update screen and Settings › Software Update now say clearly that updates are incremental: only the changed parts are downloaded, usually a few MB.

## 0.5.86 — 2026-11-18
- Several sessions sent from the same claude.ai project thread now show up as a single card.

## 0.5.85 — 2026-11-18
- Removed the preinstalled Chrome DevTools MCP server; members browse through the Kiki Chrome extension or the built-in browser.

## 0.5.84 — 2026-11-18
- Claude Code members run inside the bundled herdr by default, so they survive a Kiki restart and you can take over. herdr now ships with the app.
- A Claude Code session waiting on a permission prompt is picked up as waiting for approval; reply "allow" and Kiki presses it for you.

## 0.5.83 — 2026-11-18
- Character toggle: with the performance off, no character art; the sidebar shows a logo row and front desk items become a corner notification.

## 0.5.81 — 2026-11-18
- Experimental new dispatch flow (off by default), with question cards and many fixes from a 50-task test.

## 0.5.80 — 2026-11-18
- Remote background updates use the update screen bundled in the app, so it no longer downloads images from the remote Mac.

## 0.5.79 — 2026-11-18
- Onboarding lists the agents on this Mac; use a signed-in Claude Code as Kiki's brain in one click.

## 0.5.78 — 2026-11-18
- herdr and browser features install on demand from Settings › Extensions.

## 0.5.77 — 2026-11-18
- Welcome screen works in narrow windows.

## 0.5.76 — 2026-11-18
- High-resolution launch character art.

## 0.5.75 — 2026-11-18
- Timeline cards are colored by the model each chat actually used.

## 0.5.74 — 2026-11-18
- Orca: reopening Claude in the same terminal moves to the new card; the skip-permissions prompt counts as waiting for you.

## 0.5.73 — 2026-11-18
- The desk pet is built into Kiki.app: View › Desk Pet.
- Members can post to X, Jike and Xiaohongshu through your signed-in browser, with the same send approval.

## 0.5.72 — 2026-11-18
- Clearer task briefs (goal, done criteria, out of scope, background, tools, plan first) and English message markers.

## 0.5.71 — 2026-11-18
- Approvals for publish or delete clicks in the browser also pause and resume.

## 0.5.70 — 2026-11-18
- Members can work in their own git worktree so parallel changes to one repo don't collide.

## 0.5.69 — 2026-11-18
- Plan first: members can propose a plan in read-only mode and start only after you approve.

## 0.5.68 — 2026-11-18
- Safety floor: privilege escalation, Keychain export, changing security settings, wiping disks and touching `~/.ssh` or system folders are always blocked.

## 0.5.67 — 2026-11-18
- Approvals no longer block: the task pauses and resumes when you approve.

## 0.5.66 — 2026-11-18
- Failed tasks and undeliverable results go to Kiki to decide, and she reports back when you're free.

## 0.5.65 — 2026-11-18
- Each delivery channel runs independently, so one stuck channel doesn't hold up the others.

## 0.5.64 — 2026-11-18
- Results can be delivered to several places at once; when something you asked for is done, Kiki's chat gets a summary.

## 0.5.63 — 2026-11-18
- Notifications to Kiki's main chat are queued: urgent ones go straight through, others are bundled, and none interrupt Kiki while she's replying.

## 0.5.62 — 2026-11-18
- Better skill search ranking.

## 0.5.61 — 2026-11-18
- Goal mode: long tasks keep going until the goal is met (up to 20 rounds).

## 0.5.60 — 2026-11-18
- Members can attach finished files as deliverables to their answer.

## 0.5.59 — 2026-11-18
- Members can list, message and stop the sub-agents they started.

## 0.5.58 — 2026-11-18
- Members can edit several files in one patch, all or nothing.

## 0.5.57 — 2026-11-18
- Clearer descriptions for the sub-agent, browser, dispatch and watch tools.

## 0.5.56 — 2026-11-18
- Choice cards: members can ask you a question with 2–4 buttons.
- Members can wait for a time, a check to pass or a process to finish, and pick up where they left off.
- One search for tools, MCP tools and skills, with better Chinese matching. Members can read PDFs.
- Members follow coding best practices: read project rules, keep changes small, run tests.

## 0.5.55 — 2026-11-18
- Files must be read before they are edited; shell commands time out after 120 seconds and can run in the background. Checklists survive long chats.

## 0.5.54 — 2026-11-18
- Clearer descriptions for the to-do and ask-you tools.

## 0.5.53 — 2026-11-18
- Clearer descriptions for the basic file and shell tools.

## 0.5.52 — 2026-11-18
- Web search and page fetching for members, free sources first and your own keys as fallback.

## 0.5.51 — 2026-11-18
- Experimental new worker chat for tasks (off by default).

## 0.5.50 — 2026-11-18
- Tasks start with exactly the tools they need.

## 0.5.49 — 2026-11-18
- Faster, cache-friendly prompts for members and tasks.

## 0.5.48 — 2026-11-18
- "Dispatch rules" became your personal preferences file; HR is the new name for the people manager.

## 0.5.47 — 2026-11-18
- Experimental new Kiki main chat (off by default): three tools, a stable system prompt and recent context each turn.

## 0.5.46 — 2026-11-17
- More reliable signing when Apple's timestamp server is slow.

## 0.5.45 — 2026-11-18
- Updates only download what changed (about 5 MB instead of 107 MB).

## 0.5.44 — 2026-11-17
- The background service runs on Bun instead of Node; the app is about 20 MB smaller.

## 0.5.43 — 2026-11-17
- Front desk "Working on it" bar stays above the overlay.

## 0.5.42 — 2026-11-17
- Overview renamed Office, with a floor plan: one room per group, one desk per member. Added an "All sessions" view.

## 0.5.41 — 2026-11-17
- Command room: desks light up with each step members and external agents take. Today's report can be copied or saved as an image.

## 0.5.40 — 2026-11-17
- Toolbox can set skills, MCP servers and extensions to always on, load when needed, or off.

## 0.5.39 — 2026-11-17
- Claude Code members can work on a separate git worktree branch per task, merged only when you say so.

## 0.5.38 — 2026-11-17
- Connecting Claude Code or Codex also adds Kiki's MCP server.

## 0.5.37 — 2026-11-17
- Members can be archived or merged into another member; restore them from the storeroom at the bottom of the sidebar. HR flags members idle for 14 days.

## 0.5.36 — 2026-11-17
- New Kiki-style LINK START launch animation.

## 0.5.35 — 2026-11-17
- Kiki's MCP server includes browser control; Claude Code started by Kiki only uses Kiki's MCP.

## 0.5.34 — 2026-11-17
- External agent cards show how many files changed this turn; hover to list them.

## 0.5.33 — 2026-11-17
- Desk pet, first version: a little Kiki in the corner of your screen that changes outfits, shows "needs you" bubbles and opens Kiki when clicked.

## 0.5.32 — 2026-11-17
- Toolbox: see every tool, MCP server and skill on this Mac.

## 0.5.31 — 2026-11-17
- Shared resources like a browser are used by one task at a time; stuck or expired tasks release them after 60 minutes.

## 0.5.30 — 2026-11-17
- Orca support: each Orca agent gets a card you can reply to and approve; added the Orca plugin "Kiki".

## 0.5.29 — 2026-11-17
- Sharper update screen artwork.

## 0.5.28 — 2026-11-17
- When moving to Applications, the old copy goes to the Trash with a recognizable name.

## 0.5.27 — 2026-11-17
- T3 Code support: threads show as external agent cards you can reply to, answer and stop.

## 0.5.26 — 2026-11-17
- Install on demand: Settings › Extensions lists large components; the DSH engine can be installed and removed there.

## 0.5.25 — 2026-11-17
- The first-launch welcome screen features Ms. Kiki with a dialogue box.

## 0.5.24 — 2026-11-17
- "What should I call you?" on the welcome screen and in Settings. Leave it empty and Kiki uses no form of address.

## 0.5.23 — 2026-11-17
- Kiki Portal shows "Coming soon" in Settings.

## 0.5.22 — 2026-11-17
- Opening Kiki from the installer disk or Downloads offers to move it to Applications for you.

## 0.5.21 — 2026-11-17
- No more silently created members: Kiki hands work to an existing member and asks before hiring a new one.

## 0.5.20 — 2026-11-17
- New update screen: Ms. Kiki walks while updating, with three outfits and a new soundtrack.

## 0.5.19 — 2026-11-17
- The front desk is now a stack: newest on top, and you return to the same card after opening the original.

## 0.5.18 — 2026-11-17
- Fixed "Check for updates" saying it couldn't find a version when you were already up to date. A bar under the Kiki card shows when an update is available.

## 0.5.17 — 2026-11-17
- Browser status bar with Stop / Continue, a quick peek, and approval for dangerous buttons.

## 0.5.16 — 2026-11-17
- The launch animation ends with Ms. Kiki: 144 random character poses, with a "collected N/144" counter.

## 0.5.15 — 2026-11-17
- Manage built-in browsers in Settings and choose which members use each one.

## 0.5.14 — 2026-11-17
- Built-in browser inside Kiki.app, usable by members.

## 0.5.13 — 2026-11-17
- The browser extension connects as soon as you click Allow, no pairing code; other Macs can connect over Tailscale.

## 0.5.12 — 2026-11-17
- Document checks no longer mistake date placeholders for missing content.

## 0.5.11 — 2026-11-17
- New app icon in Settings › About and the favicon.

## 0.5.10 — 2026-11-16
- Front desk priorities: urgent items pop up on any page; others wait until you're idle on Kiki's main chat.

## 0.5.9 — 2026-11-16
- The install window shows Kiki's character art (960×600).

## 0.5.8 — 2026-11-15
- Opening a remote Kiki only transfers data: the app uses its built-in interface, with compressed, cached static files.

## 0.5.7 — 2026-11-15
- Added the "Incoming call" interaction. Fixed squashed character art.

## 0.5.6 — 2026-11-15
- New chat view switch (Classic / Desk), with Desk mode on real data.

## 0.5.5 — 2026-11-15
- Kiki at the front desk: new items waiting for you are brought to you to handle on the spot.

## 0.5.4 — 2026-11-15
- Fixed the browser pairing code not being copyable in the Mac app.

## 0.5.3 — 2026-11-15
- Theme updates for the new interface.

## 0.5.2 — 2026-11-15
- Member portraits: 102 characters assigned by name and role, shown on task cards and member settings.

## 0.5.1 — 2026-11-15
- Members can use a browser through the Kiki Chrome extension, one Chrome profile per browser.

## 0.5.0 — 2026-11-15
- New app icon: the official slanted-square logo on black.

## 0.4.99 — 2026-11-15
- Better member prompts: shorter replies and interjections, clearer tool rules.

## 0.4.98 — 2026-11-15
- Sidebar lists only each member's latest task; collapse a member by clicking its name.

## 0.4.97 — 2026-11-15
- The character is now called Kiki everywhere (with data migration); the card reads "Ms. Kiki" and small avatars use the official logo.

## 0.4.96 — 2026-11-14
- After updating, Kiki explains what was renamed.

## 0.4.95 — 2026-11-14
- New look, step 2: a Kiki character card at the top of the sidebar, changing outfit and background every two hours.

## 0.4.94 — 2026-11-14
- New look, step 1: light and dark themes use the orange-and-black brand colors.

## 0.4.93 — 2026-11-13
- Member export and import use `.kiki` files.

## 0.4.91 — 2026-11-13
- The Advisor merged into Kiki: reviews and suggestions now come from Kiki herself.

## 0.4.90 — 2026-11-13
- New wording across the app: agents are now "team members", threads are "tasks", and the gallery is the "talent pool".

## 0.4.89 — 2026-11-13
- "Needs you" items no longer get pushed out by new chats.

## 0.4.88 — 2026-11-13
- Renamed built-in agents (System Assistant → Ops Expert, Creator Assistant → HR); old names still work.

## 0.4.87 — 2026-11-13
- Groundwork for a Kiki Portal membership (not on sale).

## 0.4.86 — 2026-11-13
- Overview shows what each agent is working on; main chats can see the status of each task.

## 0.4.85 — 2026-11-13
- Agents see their own notes folder when they start work; browser permission errors explain what to do; thread results are no longer posted twice.

## 0.4.84 — 2026-11-12
- AI data export helper masks anything that looks like a secret.

## 0.4.83 — 2026-11-12
- AI data export helper: fixed a crash on very large chats.

## 0.4.82 — 2026-11-12
- Kiki and agent main chats only carry the latest turns plus thread summaries.

## 0.4.81 — 2026-11-12
- Added the AI data export helper Mac app.

## 0.4.80 — 2026-11-12
- herdr plugin "Kiki": hand off to Kiki and report status from remote machines.

## 0.4.79 — 2026-11-12
- External agent cards no longer create agents automatically.

## 0.4.78 — 2026-11-12
- Agents can show you things in your reply language; added a reply language setting.

## 0.4.77 — 2026-11-12
- Messages routed to a busy chat are added as an interjection.

## 0.4.76 — 2026-11-12
- herdr backend: external agent cards can show the screen, reply and approve.

## 0.4.75 — 2026-11-12
- Agents act within their own responsibilities without asking, and must show evidence when they say something is done.

## 0.4.74 — 2026-11-12
- PRs opened by agents are watched: CI results, comments and merges wake the chat that opened them.

## 0.4.73 — 2026-11-12
- Threads have a status: working, waiting for your answer, waiting for review, done, failed. "Recent" lists what needs your judgment first.

## 0.4.72 — 2026-11-12
- Usage counts Kiki's own agents too.

## 0.4.71 — 2026-11-12
- Chat and documents support footnotes, reference links, callouts, collapsible blocks, math, kbd and super/subscript.

## 0.4.70 — 2026-11-12
- Cards for cloud threads started by scheduled tasks jump back to the thread.

## 0.4.69 — 2026-11-11
- MCP tools load only when needed.

## 0.4.68 — 2026-11-11
- Qwen Work support.

## 0.4.67 — 2026-11-11
- Remote agents not on your Tailscale network, including claude.ai cloud, can report through hooks.kikibao.com.

## 0.4.66 — 2026-11-11
- Multi-step tasks get steps in the brief, copied into a checklist before work starts.

## 0.4.65 — 2026-11-11
- Everyone can connect Grok Bot; cloud products report through a relay.

## 0.4.64 — 2026-11-11
- Full sub-agents: general, read-only and planning types, plus custom ones, background runs and context.

## 0.4.63 — 2026-11-11
- New onboarding: after adding a model, Kiki scans the agents on this Mac and connects them in one click.

## 0.4.62 — 2026-11-11
- Threads and background tasks can start read-only sub-agents.

## 0.4.61 — 2026-11-11
- New "Write task brief" model purpose: a brief is written before work starts.

## 0.4.60 — 2026-11-11
- Leaner agent main chats.

## 0.4.59 — 2026-11-11
- MCP servers can be assigned per agent.

## 0.4.58 — 2026-11-11
- SongKey uses its official icon.

## 0.4.57 — 2026-11-11
- Moved SongKey in the provider list.

## 0.4.56 — 2026-11-10
- The external agent usage card opens a detail page. Fixed Kiki's own usage not loading.

## 0.4.55 — 2026-11-10
- Added the SongKey relay as a provider.

## 0.4.54 — 2026-11-10
- Agent chat cards in the Overview slide out as a side panel instead of navigating away.

## 0.4.53 — 2026-11-10
- The AI girl decoration is installed and on by default.

## 0.4.52 — 2026-11-10
- Webhook triggers: give a task its own URL and external services can start it; missed calls are delivered when you're back online.

## 0.4.51 — 2026-11-10
- Sticker appearance v2 with a matching Dock icon and badge.

## 0.4.50 — 2026-11-10
- Agents may push to Git repos again when asked.

## 0.4.49 — 2026-11-10
- The Send button becomes Stop while working: stops this turn and any tasks it dispatched.

## 0.4.48 — 2026-11-10
- "Needs you" cards follow real status: they disappear as soon as you click Done.

## 0.4.47 — 2026-11-10
- Plain https links in chat are clickable.

## 0.4.46 — 2026-11-10
- Working agents use thinking mode; routing stays fast.

## 0.4.45 — 2026-11-10
- The Creator Assistant builds and checks agents against a standard description format.

## 0.4.44 — 2026-11-10
- Usage includes Kiki's own model calls; DeepSeek shows the real balance.

## 0.4.43 — 2026-11-10
- Overview list and timeline headers are horizontal scrollers.

## 0.4.42 — 2026-11-10
- Updates or restarts started by an agent no longer freeze that chat.

## 0.4.41 — 2026-11-10
- Usage page shows just the numbers.

## 0.4.40 — 2026-11-10
- Agents only do what you asked: "can you…?" questions get checked and answered, and secrets are never printed.

## 0.4.39 — 2026-11-10
- "Needs you" cards are easier to track: new ones first, no jumping around, animations, and they hold still under your mouse.

## 0.4.38 — 2026-11-10
- Triage replies mention each item, in 80 characters or fewer.

## 0.4.37 — 2026-11-10
- Tidied the triage prompt.

## 0.4.36 — 2026-11-10
- Agent chat cards show status: done, asking you, or failed.

## 0.4.35 — 2026-11-10
- Wording fix in the Overview.

## 0.4.34 — 2026-11-10
- Opening a thread now comes with a plain-language reply and picks up the right context.

## 0.4.33 — 2026-11-10
- Simplified dispatch to a single tool, plus fixes from a 50-message smoke test.

## 0.4.32 — 2026-11-10
- Usage is built in again and shown in Settings.

## 0.4.31 — 2026-11-10
- When an agent claims it wrote a document that doesn't exist, Kiki checks, sends it back, and marks the card "Not written".

## 0.4.30 — 2026-11-10
- Pressing Enter to pick a word in an input method no longer sends the message.

## 0.4.29 — 2026-11-10
- Background tasks run without a concurrency limit by default; set one in Settings.

## 0.4.28 — 2026-11-10
- External agents join the ticket ledger; external changes are versioned automatically.

## 0.4.27 — 2026-11-10
- Ticket reports: one line when a request is done, ledger in the daily briefing, nightly review.

## 0.4.26 — 2026-11-10
- A task can wait for several others to finish before starting.

## 0.4.25 — 2026-11-10
- All task dispatch goes through tickets with a required destination.

## 0.4.24 — 2026-11-10
- Every request now gets a tracked ticket, with file versions saved when it's done.

## 0.4.23 — 2026-11-10
- Deleting an agent requires typing its name.

## 0.4.22 — 2026-11-10
- Fixed Mac builds failing since 0.4.12.

## 0.4.21 — 2026-11-09
- Usage moved into a plugin and shown on the Overview.

## 0.4.20 — 2026-11-09
- Example plugin connecting WeChat and Feishu to Kiki.

## 0.4.19 — 2026-11-09
- Agents missing a skill can ask the Creator Assistant to add it.

## 0.4.18 — 2026-11-09
- Fixed document cards written by other agents not opening.

## 0.4.17 — 2026-11-09
- Kiki itself decides when an agent's main chat should open a thread.

## 0.4.16 — 2026-11-09
- Plugins can add cards to the Overview.

## 0.4.15 — 2026-11-09
- Plugins can send Kiki's follow-ups and reminders back to WeChat or Feishu.

## 0.4.14 — 2026-11-09
- Messages from chat apps can be passed to Kiki.

## 0.4.13 — 2026-11-09
- Plugins can bring their own background services.

## 0.4.12 — 2026-11-09
- Three brand appearances: Tower, Eyes and Sticker (avatars, logo and Dock icon change too).

## 0.4.11 — 2026-11-09
- The top bar can drag the window inside an agent; clicking Kiki takes you back.

## 0.4.10 — 2026-11-09
- Fixed some document cards not opening.

## 0.4.9 — 2026-11-09
- Selecting text no longer jumps to another chat or gets pushed down by new messages.

## 0.4.8 — 2026-11-09
- Hermes fixes: reminder to restart the gateway, error cards, long lines no longer folded.

## 0.4.7 — 2026-11-09
- Tests no longer write to your real update log.

## 0.4.6 — 2026-11-09
- System agents move off-topic chats to the right agent, leaving a card behind.

## 0.4.5 — 2026-11-09
- The System Assistant can connect Grok Bot over MCP.

## 0.4.4 — 2026-11-09
- Hermes support in the external agents panel.

## 0.4.3 — 2026-11-09
- The Right ⌥ + → confirmation uses Kiki's own style.

## 0.4.1 — 2026-11-09
- WorkBuddy support for external agent cards.

## 0.4.0 — 2026-11-09
- Brighter agent avatars with clearer working animation.

## 0.3.100 — 2026-11-09
- Fixed the Kiki orb being hard to see at the end of the update and launch screens.

## 0.3.99 — 2026-11-09
- Agent main chats open a thread by default; only small talk is answered directly.

## 0.3.98 — 2026-11-09
- Fixed agents answering twice after a handoff came back.

## 0.3.97 — 2026-11-09
- Fixed builds failing since 0.3.91.

## 0.3.96 — 2026-11-09
- Background task reports in Kiki's chat are compact three-line cards; added "Just finished" to the right column.

## 0.3.95 — 2026-11-09
- "Done" in the Overview works on the first click.

## 0.3.94 — 2026-11-09
- Clicking an external agent card started from a project thread jumps back to that thread.

## 0.3.93 — 2026-11-09
- New agent avatars based on the Kiki app icon.

## 0.3.92 — 2026-11-09
- Built-in agents renamed: System Assistant, Creator Assistant and Advisor.

## 0.3.91 — 2026-11-09
- Added the DSH engine and the pi-kiki package.

## 0.3.90 — 2026-11-09
- System agents and Settings are pinned to the bottom of the sidebar; the agent list scrolls on its own.

## 0.3.89 — 2026-11-09
- A manual update waits at most 2 minutes for busy chats, then pauses them and resumes after updating.

## 0.3.88 — 2026-11-09
- Shortcuts: Right ⌥ + ← opens the first "Needs you" card, Right ⌥ + → confirms and completes it (works in the background).

## 0.3.87 — 2026-11-09
- "What Kiki did automatically" explains why and what exactly changed.

## 0.3.86 — 2026-11-09
- "What Kiki did automatically" is written in plain words.

## 0.3.85 — 2026-11-09
- The third column follows the agent you switch to.

## 0.3.84 — 2026-11-09
- Thread checklists moved to the top; background tasks for the same chat queue up.

## 0.3.82 — 2026-11-09
- Gemini support: the Mac app and Gemini CLI show up as external agent cards.

## 0.3.81 — 2026-11-09
- Overview search finds external agent sessions by repo, computer or tool.

## 0.3.80 — 2026-11-09
- Select and copy text in chats; "Process" can be expanded while working.
- Added an Upstream agent that watches external dependencies for updates. Plugins can bring scheduled tasks.
- Kiki learns from routing corrections with a weekly review, and rolls back changes that make things worse.
- Added the built-in Advisor agent that writes daily suggestions to the Overview.

## 0.3.79 — 2026-11-09
- Agents can use your everyday Chrome through a built-in MCP server.

## 0.3.78 — 2026-11-09
- The mstack skill set is only used when you turn it on.

## 0.3.77 — 2026-11-09
- Agent chats only show chats; Overview content no longer lingers.

## 0.3.76 — 2026-11-07
- New colors for lines of work.

## 0.3.75 — 2026-11-07
- Added a built-in Creator agent that builds and checks up on agents. Kiki asks clarifying questions before starting something new.

## 0.3.74 — 2026-11-07
- On large screens Kiki's chat is flanked by what agents are doing and what needs you. Lists, headings and tables render properly in chat.

## 0.3.73 — 2026-11-07
- Plugins: a plugin is an agent with its own page. pi packages can be installed for a single agent.

## 0.3.72 — 2026-11-07
- New agents are announced as a card in Kiki's chat.

## 0.3.71 — 2026-11-07
- Large-screen Overview is now a three-column dashboard.

## 0.3.70 — 2026-11-07
- Upgraded to Node 26, pi 1.5.0 and TypeScript 7. Requires macOS 13.5 or later.

## 0.3.69 — 2026-11-07
- Kiki MCP can query registered local services read-only, and hand tasks to Kiki.

## 0.3.68 — 2026-11-07
- Dark mode is now pure black. Agents can have their own color and the interface follows it.

## 0.3.67 — 2026-11-07
- Kiki is an MCP server: other AI products can report progress with `kiki_report` and show up as external agent cards.

## 0.3.66 — 2026-11-07
- Removed the heavy red border from "Needs you" cards.

## 0.3.65 — 2026-11-07
- "Edit description" opens a dialog: write in your own words and AI tidies it into the description.

## 0.3.64 — 2026-11-07
- Scheduled tasks can be paused and resumed; the board shows the last 20 runs. Right-click an agent to delete it.

## 0.3.63 — 2026-11-07
- The SAO appearance ships with the app.

## 0.3.62 — 2026-11-07
- The section under Kiki now lists "Recent" instead of attached chats.

## 0.3.60 — 2026-11-07
- Fixed the "what all agents are doing" panel stretching the whole page; it now scrolls on its own.

## 0.3.59 — 2026-11-07
- Fixed the whole window being draggable after clicking certain spots.

## 0.3.58 — 2026-11-07
- Agent instruction files only describe what the agent is responsible for.

## 0.3.56 — 2026-11-07
- Clicking a Claude chat card opens the Claude app.

## 0.3.55 — 2026-11-07
- The "Process" line shows the working agent's orb.

## 0.3.54 — 2026-11-07
- Agents' in-progress chatter folds into "Process"; only the final answer shows.

## 0.3.53 — 2026-11-07
- ⌘⇧U shows the name of each part of the interface.

## 0.3.50 — 2026-11-07
- Interjections are labelled by source: you, a relay, a new external message, or a Kiki reminder.

## 0.3.49 — 2026-11-07
- Cleaner external agent cards.

## 0.3.47 — 2026-11-07
- Documents mentioned in replies become cards that open in a reader.

## 0.3.46 — 2026-11-07
- Your to-dos in the Overview open to show details and the original chat.

## 0.3.45 — 2026-11-07
- Unified headers and input boxes for main chats and threads.

## 0.3.44 — 2026-11-07
- Connect a cloud environment to Kiki with one line: `dl.kikibao.com/cloud.sh`.

## 0.3.43 — 2026-11-07
- Overview shows Claude cloud scheduled tasks.

## 0.3.42 — 2026-11-07
- Shorter, clearer agent answers. Fixed answers appearing twice while streaming.

## 0.3.41 — 2026-11-07
- Handoff details at the top of a thread are folded away.

## 0.3.40 — 2026-11-07
- Overview "Your to-dos": your own items, with checkboxes.

## 0.3.39 — 2026-11-07
- Chats archived in Codex are collapsed in Kiki.

## 0.3.38 — 2026-11-07
- Agent avatars are always the Kiki orb.

## 0.3.37 — 2026-11-07
- Better Codex integration: shows working, needs approval and interrupted; cards open in the Codex app.

## 0.3.36 — 2026-11-07
- The System Assistant can turn on auto-linking local Claude Code chats to claude.ai.

## 0.3.35 — 2026-11-07
- Remote Control sessions remember their claude.ai address.

## 0.3.34 — 2026-11-06
- Background updates are silent; the full-screen update screen only plays when you update manually.

## 0.3.33 — 2026-11-06
- Keychain storage is off by default. Fixed Kiki not being able to read keys and chat.

## 0.3.32 — 2026-11-06
- Clicking a Remote Control session card opens the chat on claude.ai.

## 0.3.31 — 2026-11-06
- Removed advanced Keychain / 1Password hints from Settings.

## 0.3.30 — 2026-11-06
- Model keys can be stored in the macOS Keychain.

## 0.3.29 — 2026-11-06
- Beta invite codes: enter once on first launch, then works offline.

## 0.3.28 — 2026-11-06
- The `.dmg` file name includes the version.

## 0.3.27 — 2026-11-06
- First launch without a model starts with "Connect a model".

## 0.3.26 — 2026-11-06
- Fixed squashed, truncated "Needs you" cards.

## 0.3.25 — 2026-11-06
- Themes and decorations from the gallery update automatically.

## 0.3.24 — 2026-11-06
- Reminders and the daily briefing are clickable cards; permission requests are in plain words.

## 0.3.23 — 2026-11-06
- New external agent chats get a matching agent automatically.

## 0.3.22 — 2026-11-06
- Overview summary: what needs you, your lines of work, and what happened while you were away. Approve local Claude Code permission requests from the Overview.

## 0.3.21 — 2026-11-06
- App updates show a full-screen "LEVEL UP" screen with music.

## 0.3.20 — 2026-11-06
- Fixed "update script stopped unexpectedly" after an app update finished downloading.

## 0.3.19 — 2026-11-06
- Added the download mirror dl.kikibao.com; updates try the mirror first, then GitHub.

## 0.3.18 — 2026-11-06
- Cloud thread cards show title, your message, the reply, and open the thread.

## 0.3.17 — 2026-11-06
- Provider logos in Settings: grey until connected.

## 0.3.16 — 2026-11-06
- Prevented agents from looping messages between each other.

## 0.3.15 — 2026-11-06
- External agent cards are tagged with an agent; filter "Needs you" by agent.

## 0.3.14 — 2026-11-06
- Threads keep chatting while working: interject while busy, checklist cards, and unfinished work resumes on its own.

## 0.3.13 — 2026-11-06
- "Needs you" cards are colored by tool.

## 0.3.12 — 2026-11-06
- New line icons in the Settings sidebar.

## 0.3.11 — 2026-11-06
- New built-in "Miracle" appearance.

## 0.3.10 — 2026-11-06
- Codex cards use Codex's own chat titles.

## 0.3.9 — 2026-11-06
- Overview timeline scrolls continuously into the past.

## 0.3.8 — 2026-11-06
- Appearance split into one theme plus any number of decorations.

## 0.3.7 — 2026-11-06
- App updates show download progress, resume, use the system proxy and explain failures.

## 0.3.6 — 2026-11-05
- Smoother stacked cards in the Overview.

## 0.3.5 — 2026-11-05
- Launch animation ends in a white space with an original sound effect.

## 0.3.4 — 2026-11-05
- New `.dmg` install window with the Kiki orb.

## 0.3.3 — 2026-11-05
- Fixed startup stuck on a spinner; after reinstalling you can pick the connection again; remote connections that fail for 30 seconds offer to change address.

## 0.3.2 — 2026-11-05
- Software Update split into "App on this Mac" and "Background service".

## 0.3.1 — 2026-11-05
- Overview timeline pins "Needs you" to the top and stacks finished cards.

## 0.3.0 — 2026-11-05
- Kiki now appears in macOS Local Network permissions so you can allow it.

## 0.2.100 — 2026-11-05
- Added the Kiki gallery website: browse and install themes and agents via `kiki://` links.

## 0.2.99 — 2026-11-05
- Messages are relayed with your exact words attached; approvals only count your own words.

## 0.2.98 — 2026-11-05
- Overview timeline: every line of work shown, cards colored by who is working; external agent cards open directly.

## 0.2.97 — 2026-11-05
- External agent usage via ccusage (18 tools), updated daily with automatic rollback.

## 0.2.96 — 2026-11-05
- Agent avatars back to the Kiki orb, now with eyes: blinks when idle, looks around when working, smiles when done.

## 0.2.95 — 2026-11-05
- Cute agent avatars: 12 shapes × 10 colors.

## 0.2.94 — 2026-11-05
- Fixed interjection notices popping up in pairs, and raw tags leaking into the briefing.

## 0.2.93 — 2026-11-05
- Cloud reports are labelled "Cloud".

## 0.2.92 — 2026-11-05
- External agent cards now read "Done, waiting for your review", with titles matching Claude Code, a Done button and a log.

## 0.2.91 — 2026-11-05
- Sidebar agent groups: automatic grouping, pinning, collapsing rarely used ones, and agent search (⌘K).

## 0.2.90 — 2026-11-05
- Fixed the app failing to connect to a remote Kiki on macOS 26; remote checks time out after 10 seconds.

## 0.2.89 — 2026-11-05
- Claude Code engine: an agent can do its work with the Claude Code on your Mac.

## 0.2.88 — 2026-11-05
- See and interject in local Claude Code sessions; agents can check who is doing what.

## 0.2.87 — 2026-11-05
- Claude Code running in the cloud can report progress to Kiki through a Cloudflare Tunnel (only password-protected reports are accepted).

## 0.2.86 — 2026-11-04
- Theme API, command menu (⌘J) and immersive mode.

## 0.2.85 — 2026-11-04
- Added an Overview page; task cards include your own to-dos.

## 0.2.84 — 2026-11-04
- Building the `.dmg` retries up to 3 times.

## 0.2.83 — 2026-11-04
- Added the slogan "Create the next miracle."

## 0.2.82 — 2026-11-04
- Export and import agents as a single file or a GitHub link, with a preview before installing.

## 0.2.81 — 2026-11-04
- Right column groups work by job, pulled automatically from chats.

## 0.2.80 — 2026-11-04
- Added the System Assistant agent and Claude Code / Codex integration: Kiki knows how your terminal tasks are going.

## 0.2.79 — 2026-11-04
- Threads have a "⋯" menu with Delete.

## 0.2.78 — 2026-11-04
- More reliable notarization.

## 0.2.77 — 2026-11-03
- Full-auto mode: back up first, send directly or stay within budget instead of asking; checks where instructions come from; asks for all Mac permissions at once.

## 0.2.76 — 2026-11-03
- Daily briefing every morning: what's waiting on you, what failed, what's done, what's on today.

## 0.2.75 — 2026-11-03
- Each background task runs in its own process; stopping a task stops that process.

## 0.2.74 — 2026-11-03
- Builds are signed and notarized by Apple; signed builds only accept updates from the same developer.

## 0.2.73 — 2026-11-03
- Settings: "Models and keys" split into "Models" and "Providers".

## 0.2.72 — 2026-11-03
- Every chat acknowledges you first with a quick reaction and a one-line reply; models can be set per purpose.

## 0.2.71 — 2026-11-03
- Added the Postroom: one inbox for messages from external agents, with timely reminders.

## 0.2.70 — 2026-11-03
- Task management: done criteria, stop / change / redo, and follow-ups when finished.

## 0.2.69 — 2026-11-03
- Connecting from a new Mac asks for Local Network permission, explains why a connection failed, and fills in the port.

## 0.2.68 — 2026-11-03
- Fixed a black window: if the launch page fails to load, Kiki goes straight to the main screen.

## 0.2.67 — 2026-11-02
- Connect to Kiki with `Tailscale IP:4567`.

## 0.2.66 — 2026-11-02
- The app checks for and installs its own updates.

## 0.2.65 — 2026-11-02
- Tasks: to-dos and schedules, stops to ask you when stuck, and a task board.

## 0.2.63 — 2026-11-02
- Remote connection accepts a Tailscale IP directly.

## 0.2.62 — 2026-11-02
- Added the launch animation (light tunnel, self-check, "Welcome back"); Kiki remembers full screen.

## 0.2.61 — 2026-11-02
- Configure every model provider in Settings: toggle, key or subscription sign-in, and model selection.

## 0.2.59 — 2026-11-02
- Model picker next to the input box, image attachments, and sign-in with a ChatGPT subscription.

## 0.2.57 — 2026-11-02
- Agent avatars use the colored Kiki orb; wider sidebar.

## 0.2.55 — 2026-11-02
- Easier first run: guidance when no key is set, errors explained in plain words, keys work immediately. Kiki refuses to run straight from the installer disk.

## 0.2.53 — 2026-11-02
- Main chat and threads widen together when you resize the window.

## 0.2.49 — 2026-11-02
- Conversation summaries and layered routing; questions about another agent's work get a short answer and are copied to that agent.

## 0.2.44 — 2026-11-02
- Fixed auto-update getting stuck "waiting for chats to finish".

## 0.2.41 — 2026-11-02
- Threads can be deleted and main chats cleared.

## 0.2.40 — 2026-11-02
- Default agent avatars are little robots generated from the name.

## 0.2.39 — 2026-11-02
- Added a fourth column showing what an agent is up to.

## 0.2.38 — 2026-11-02
- Each agent has a settings button to edit its responsibilities and avatar.

## 0.2.32 — 2026-11-02
- Better contrast between layers in dark mode.

## 0.2.31 — 2026-11-02
- The right column switches between threads and an overview.

## 0.2.30 — 2026-11-02
- New "Create agent" dialog: name, responsibilities and avatar.

## 0.2.29 — 2026-11-02
- Two-level dispatch: Kiki → an agent's main chat → threads. One message can be split across several agents.

## 0.2.28 — 2026-11-02
- Three-column layout: agent list › agent's main chat › threads.

## 0.2.26 — 2026-11-02
- Conversation cards in a chat open in the right column, and you can keep talking there.

## 0.2.25 — 2026-11-02
- Removed the separate title bar; the columns now reach the top of the window.

## 0.2.23 — 2026-11-02
- Version number and "Check for updates" are pinned to the bottom-left of Settings.

## 0.2.22 — 2026-11-02
- Fixed the "Updating" dialog that could not be closed.

## 0.2.21 — 2026-11-02
- Releases now include a `.dmg` installer.

## 0.2.20 — 2026-11-02
- Expanded acknowledgements to credit Claude Code, Codex, Hermes and other agents.

## 0.2.19 — 2026-11-02
- Added an update dialog with version, notes and a step-by-step log.

## 0.2.18 — 2026-11-02
- Chats now show live progress: thinking, which tool is running, how many steps.

## 0.2.16 — 2026-11-02
- Added an update progress bar.
- Fixed "new version found" followed by "no installable version" when you clicked Update.

## 0.2.15 — 2026-11-02
- Kiki only dispatches: it creates a new agent when none fits, and answers one-liners itself.

## 0.2.14 — 2026-11-02
- Animated avatar; relayed replies fold into cards.

## 0.2.13 — 2026-11-02
- Update checks retry automatically when they fail.

## 0.2.10 — 2026-11-02
- Settings now uses a two-pane layout like macOS System Settings.

## 0.2.9 — 2026-11-02
- Added light and dark appearance; Settings opens as a macOS-style window.

## 0.2.8 — 2026-11-02
- Kiki asks before doing anything that can't be undone.

## 0.2.7 — 2026-11-02
- Simplified the default team to a single router agent.

## 0.2.6 — 2026-11-02
- Agents can hand off new work to a new conversation instead of asking first; you can edit the dispatch rules.
- Agents can read other conversations, pass messages along and save facts to "About me".
- Updates are now checked hourly instead of every 6 hours.

## 0.2.5 — 2026-11-02
- Redesigned chat into three columns.
- Added extension management and MCP servers in Settings.

## 0.2.3 — 2026-11-02
- Kiki now routes each message to the right conversation automatically.
- Added background tasks: one Markdown file per task, survives restarts, reports back to the original chat when done.
- Added Settings: models and keys, About me, agents, remote access, updates.

## 0.2.2 — 2026-11-02
- Fixed key loading always waiting the full 20 seconds, and made `.env` parsing handle spaces, `export` and trailing comments.

## 0.2.1 — 2026-11-02
- Fixed startup hanging while reading API keys: keys can come from the macOS Keychain, 1Password waits at most 20 seconds, and Kiki starts anyway if none are found.

## 0.2.0 — 2026-11-02
- Kiki.app is now a native window instead of opening your browser.

## 0.1.2 — 2026-11-02
- The new logo now shows inside the app too.

## 0.1.1 — 2026-11-02
- Replaced Telegram with a local chat web page.
- Added the Kiki Mac app: installable, starts at login, updates itself, safe to use remotely.
- Kiki's engine settings are kept separate from any pi you installed yourself.
- New Kiki logo and app icon.

## 0.1.0 — 2026-11-01
- First version: a personal assistant router built on pi, running as a Telegram bot.
