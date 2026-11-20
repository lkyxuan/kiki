# Changelog

Every Kiki release, newest first. Kiki updates itself; you can also read this in the app under Settings › Software Update, or online at [getkiki.ai/changelog](https://getkiki.ai/changelog/).

<!-- One section per release: "## <version> — <YYYY-MM-DD>", then one bullet per change in plain English that a user understands
     (start with Added / Fixed / Improved / … ). No internal details, PR numbers or private names. Each PR that bumps package.json adds its section on top. -->

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
