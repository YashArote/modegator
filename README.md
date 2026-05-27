# Modegator

## Important Links
* **[Official Documentation](https://modegator.netlify.app/)**
* **[For Judges](https://modegator.netlify.app/getting-started/testing-guide)**

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

## 🚀 How to Access
Once Modegator is installed on your subreddit, accessing the centralized dashboard is incredibly simple:
1. Navigate to your subreddit on the official Reddit web or mobile app.
2. Open the `...` overflow menu on the subreddit header.
3. Click the **🛡️ Open MG Dashboard** button to launch your private, full-screen Mod Portal.
