# ModKit Manual Test Plan

This document outlines a comprehensive manual testing strategy to verify every moving part of the ModKit engine. We have broken this down into **4 distinct test scenarios**.

Follow the instructions carefully. Copy the YAML provided for each test, paste it into the ModKit Editor, hit "Save", and perform the manual Reddit actions to verify.

---

## Test 1: The "Kitchen Sink" (Rules, Conditions, Macros)
**Goal:** Verify that triggers fire, complex logic evaluates correctly, macros resolve, and Reddit API actions execute successfully.

**1. Save this YAML:**
```yaml
version: "1"
name: "Kitchen Sink Test"

macros:
  - name: "LogAndWarn"
    actions:
      - type: "add_mod_note"
        label: "SPAM_WARNING"
        note: "Triggered Kitchen Sink Test"
      - type: "send_private_message"
        subject: "ModKit Automated Warning"
        body: "Your post matched our test criteria!"

rules:
  - name: "Post Title Filter"
    trigger:
      event: "PostSubmit"
    conditions:
      - all_of:
          - field: "post_title"
            operator: "regex"
            value: "\\[test\\]" # Case-insensitive [test]
          - field: "author_is_mod"
            operator: "=="
            value: false # Testing with a mod account requires this to be false
    actions:
      - type: "run_macro"
        macro: "LogAndWarn"
      - type: "set_post_flair"
        flair_text: "ModKit Tested"
```

**2. Manual Action:**
Go to your subreddit and create a new text post with the title: `[test] This is a test post`.

**3. Expected Verification:**
- Go to the Mod Log or the post itself. The post should now have a `ModKit Tested` flair.
- Check your Reddit Inbox. You should have received a private message titled "ModKit Automated Warning".
- Check the Mod Notes on your username. There should be a new `SPAM_WARNING` note attached.

---

## Test 2: Fallback Logic & Comment Triggers
**Goal:** Verify that `fallback_actions` execute strictly when conditions evaluate to `false`.

**1. Save this YAML:**
```yaml
version: "1"
name: "Fallback Test"

rules:
  - name: "Comment Filter"
    trigger:
      event: "CommentSubmit"
    conditions:
      - field: "comment_body"
        operator: "regex"
        value: "forbiddenword"
    actions:
      - type: "remove_comment"
        spam: true
    fallback_actions:
      - type: "submit_comment"
        text: "ModKit: I saw your comment and it looks completely fine!"
        distinguish: true
        sticky: true
```

**2. Manual Action:**
Go to any existing post on the subreddit and write a normal comment: `Hello world, just testing!`. 

**3. Expected Verification:**
- Because your comment *does not* contain "forbiddenword", the condition evaluates to `false`.
- The `fallback_actions` should immediately execute.
- Refresh the page. You should see a new sticky, distinguished moderator comment replying to you saying: "ModKit: I saw your comment and it looks completely fine!"

---

## Test 3: UI Actions (Context Menus)
**Goal:** Verify that UI Actions successfully register into Reddit's native context menus and execute on demand.

**1. Save this YAML:**
```yaml
version: "1"
name: "UI Context Menu Test"

ui_actions:
  - name: "Nuke Thread"
    label: "Nuke Thread"
    location: "post"
    actions:
      - type: "lock_post"
      - type: "submit_comment"
        text: "This thread has been nuked via ModKit UI."
        distinguish: true
        sticky: true

  - name: "Yeet Comment"
    label: "Yeet Comment"
    location: "comment"
    actions:
      - type: "remove_comment"
```

**2. Manual Action:**
- **For the Post Action:** Go to any unlocked post. Click the `...` (overflow menu) or the Devvit app icon on the post. Select `ModKit Actions (Post)`, and click "Nuke Thread".
- **For the Comment Action:** Go to any comment. Click the `...` (overflow menu). Select `ModKit Actions (Comment)`, and click "Yeet Comment".

**3. Expected Verification:**
- The Post should instantly become locked, and a sticky comment should appear.
- The Comment should disappear (removed by Devvit).

---

## Test 4: Scheduled Tasks (Cron Engine)
**Goal:** Verify that our newly built background synchronization engine accurately registers cron jobs with Reddit.

**1. Save this YAML:**
```yaml
version: "1"
name: "Cron Engine Test"

scheduled:
  - name: "Minute Pinger"
    cron: "*/1 * * * *" # Runs every 1 minute
    actions:
      - type: "send_modmail"
        subject: "Cron Ping"
        body: "The ModKit background scheduler is alive and ticking!"
        internal: true
```

**2. Manual Action:**
- Once you save this configuration, simply **wait 1 to 2 minutes.** You do not need to do anything else.

**3. Expected Verification:**
- Open your subreddit's ModMail.
- You should see a brand new internal ModMail discussion titled "Cron Ping" confirming the background engine successfully executed the task.
- *Note:* After verifying, be sure to delete this YAML or change the cron expression so it doesn't spam your ModMail forever!
