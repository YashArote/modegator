# Modegator

## Important Links
* **[Official Documentation](https://modegator.netlify.app/)**
* **[Testing & Verification Guide](https://modegator.netlify.app/getting-started/testing-guide)**

## Tool Overview
Modegator is an advanced, YAML-driven automation platform built natively on the Reddit Developer Platform (Devvit). It serves as the next evolution of Reddit community management. It provides everything AutoModerator currently offers, such as keyword filtering, automatic post removals, and instant replies, but extends those capabilities significantly by introducing stateful memory tracking, automated cron scheduling, and custom interactive mod tools—all managed through a powerful, intuitive GUI.

Unlike legacy bot solutions, Modegator requires zero external hosting and runs securely within Reddit's ecosystem.

## Core Functionality

* **Event-Driven Rules:** Triggers on new posts, comments, reports, and ModMail. Evaluates complex nested conditions (e.g., regex matching, author karma checks) before executing actions like removals, flairs, and approvals.
* **Stateful Database:** Tracks persistent data using a built-in Redis instance. Moderators can increment penalty counters for repeat offenders, store custom variables across threads, and visually tag link domains in a database.
* **Scheduled Cron Jobs:** Allows moderators to set up background timers (e.g., locking a megathread every Sunday, or sending a weekly digest of reported content to ModMail) without needing a user trigger.
* **Interactive UI Tools:** Moderators can configure custom, clickable buttons that inject natively into Reddit posts and comments. Clicking these buttons can trigger a sequence of automated actions on the fly.
* **Reusable Macros:** Allows moderators to define complex action sequences once and reuse them across multiple rules or UI buttons, keeping configurations clean and manageable.
* **External Webhooks:** Silently push automated alerts, state reports, or rule-breaking content straight to a Discord channel or Slack workspace.
* **Action Logging:** Maintains a persistent audit log, giving moderators full visibility into exactly which rules triggered actions against specific posts or users.
* **Live Test Runner:** Provides a built-in simulation environment where moderators can safely test their YAML rules against real posts or comments by ID to verify logic before deploying.

## Intended Usage
Moderators interact with Modegator primarily through an intuitive web-based GUI built directly into the Reddit interface. From here, they can write, validate, and deploy their YAML configurations, securely simulate rules using the test runner, review their action logs, and monitor their automation pipelines seamlessly from any device without needing to use browser extensions.

## Project Impact
Modegator is designed to significantly reduce the manual workload for moderator teams while increasing the consistency of their enforcements. 

**Communities that benefit:**
1. **r/AskScience & r/AskHistorians (High-Quality Q&A):** These communities require strict curation. Moderators can use Modegator’s **Interactive UI Actions** to add quick "Spam", "Needs Source", or "Off-Topic" buttons directly onto comments. Instead of manually typing out removal reasons and banning users, a single click can remove the comment, log a strike in the stateful database, and automatically message the user, saving countless hours of repetitive typing.
2. **r/BuyItForLife & Trading Communities (Spam & Domain Tracking):** Marketplaces battle constant link farming and promotional spam. Modegator’s **Stateful Database** allows these subreddits to visually tag and track shady domains across the entire community automatically. If a domain hits a certain threshold of user reports, it can be flagged in Redis and instantly trigger an external webhook alert to the mod team's Discord.
3. **r/gaming & Mega-Subreddits (High Volume):** Managing millions of users means repeat offenders slip through the cracks of a stateless AutoMod. With Modegator, mods can increment a user's `warning_count` in the database for minor infractions. Once that counter hits 3, a cron job or a rule can automatically issue a temporary ban, perfectly automating the escalation path without any manual tracking spreadsheets.

## 🚀 How to Access
Once Modegator is installed on your subreddit, accessing the centralized dashboard is incredibly simple:
1. Navigate to your subreddit on the official Reddit web or mobile app.
2. Open the `...` overflow menu on the subreddit header.
3. Click the **🛡️ Open MG Dashboard** button to launch your private, full-screen Mod Portal.
