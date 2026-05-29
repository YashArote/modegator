export const BUILT_IN_TEMPLATES = {
  'Rule Engine Sandbox': `version: "1.0"
name: "Rule Engine Sandbox"
description: "Comprehensively tests all fields, operators, recursive conditions, and fallback actions."
rules:
  - name: "Recursive logical condition test"
    trigger:
      event: "PostSubmit"
    conditions:
      - all_of:
          - field: "post_link_type"
            operator: "=="
            value: "link"
          - any_of:
              - field: "author_karma"
                operator: "<="
                value: 100
              - field: "author_age_days"
                operator: "<"
                value: 30
          - none_of:
              - field: "author_is_mod"
                operator: "=="
                value: true
              - field: "author_is_approved"
                operator: "=="
                value: true
    actions:
      - type: "set_post_flair"
        flair_text: "Unverified Link"
        flair_css_class: "warn"
    fallback_actions:
      - type: "set_post_flair"
        flair_text: "Trusted Account Link"
        flair_css_class: "safe"

  - name: "Text operators check"
    trigger:
      event: "CommentSubmit"
    conditions:
      - field: "comment_body"
        operator: "regex"
        value: "(?i)click here|free gift"
      - field: "comment_score"
        operator: "<"
        value: 1
      - field: "comment_is_top_level"
        operator: "=="
        value: true
    actions:
      - type: "remove_comment"
        spam: true
      - type: "submit_comment"
        text: "Automated removal of suspicious comment by {{author}}."
        distinguish: true

  - name: "Modmail trigger evaluation"
    trigger:
      event: "ModMail"
    conditions:
      - field: "modmail_subject"
        operator: "contains"
        value: "appeal"
      - field: "modmail_body_length"
        operator: ">="
        value: 10
    actions:
      - type: "reply_modmail"
        text: "Thank you for your appeal, {{author}}. Our moderators will review this."
        internal: false
        hidden: true
`,
  'Action Engine Sandbox': `version: "1.0"
name: "Action Engine Sandbox"
description: "Demonstrates and tests all supported actions including post, comment, user, note, and modmail modifications."
macros:
  - name: "Nuke and Alert Macro"
    actions:
      - type: "remove_post"
        spam: false
      - type: "lock_post"
      - type: "mark_post_nsfw"
      - type: "mark_post_spoiler"
      - type: "submit_comment"
        text: "This thread has been flagged and archived by {{author_name}}."
        distinguish: true
        sticky: true
      - type: "ban_user"
        duration: 3
        reason: "Repeated violations"
        mod_note: "Banned during macro execution"
        message: "You have been banned for 3 days."
      - type: "add_mod_note"
        label: "BAN"
        note: "Banned 3 days for community safety."

rules:
  - name: "Auto-nuke specific titles"
    trigger:
      event: "PostSubmit"
    conditions:
      - field: "post_title"
        operator: "contains"
        value: "nuke me"
    actions:
      - type: "run_macro"
        macro: "Nuke and Alert Macro"
      - type: "delay"
        duration_ms: 1000
      - type: "send_private_message"
        to: "{{author}}"
        subject: "Post automatically nuked"
        body: "Your post {{post_id}} was nuked because the title contained restricted keywords."
      - type: "stop_if"
`,
  'Stateful and Webhook Logic': `version: "1.0"
name: "Stateful and Webhook Logic"
description: "Shows how to increment counters, save custom keys, tag domains, check them in rules, and push alerts to webhooks."
rules:
  - name: "Track reported domains"
    trigger:
      event: "PostReport"
    actions:
      # Track reports globally
      - type: "increment_counter"
        key: "post_reports_{{post_id}}"
        
      # On the 1st report, tag as Under Review
      - type: "if"
        conditions:
          - field: "counter_post_reports_{{post_id}}"
            operator: "=="
            value: 1
        then:
          - type: "tag_domain"
            domain: "{{post_domain}}"
            tag: "Under Review"
          - type: "increment_counter"
            key: "reported_domains_count"
          - type: "store_value"
            key: "last_reported_domain"
            value: "{{post_domain}}"

  - name: "Spam domain threshold auto-action"
    trigger:
      event: "PostSubmit"
    conditions:
      - field: "post_domain_tag"
        operator: "=="
        value: "Under Review"
    actions:
      - type: "remove_post"
      - type: "send_webhook"
        url: "https://discord.com/api/webhooks/your_webhook_id/your_webhook_token"
        message: "Automated Removal: Post with flagged domain {{post_domain}} submitted by {{author}}."

  - name: "Query state via comment command"
    trigger:
      event: "CommentSubmit"
    conditions:
      - field: "comment_body"
        operator: "contains"
        value: "!state"
    actions:
      - type: "submit_comment"
        text: |
          🤖 **Modegator State Report**

          * Total domains flagged: **{{counter_reported_domains_count}}**
          * Last domain reported: **{{custom_last_reported_domain}}**
`,
  'Interactive Mod Tools': `version: "1.0"
name: "Interactive Mod Tools"
description: "Declares UI Actions (clickable buttons in Reddit interface) and cron jobs that run macros."
macros:
  - name: "Soft Warn User"
    actions:
      - type: "stop_if"
        conditions:
          - field: "author_is_mod"
            operator: "=="
            value: true
      - type: "submit_comment"
        text: "Please keep comments civil in this thread."
        distinguish: true
      - type: "add_mod_note"
        label: "ABUSE_WARNING"
        note: "Warned for civility."

ui_actions:
  - name: "Warn Member"
    label: "Warn Member"
    location: "comment"
    run_macro: "Soft Warn User"

  - name: "Quick Lock Post"
    label: "Quick Lock"
    location: "post"
    actions:
      - type: "lock_post"
      - type: "submit_comment"
        text: "This thread has been locked by a moderator."
        distinguish: true
        sticky: true

  - name: "Nuke post"
    label: "Nuke post"
    location: "post"
    run_macro: "Nuke and Alert Macro"

scheduled:
  - name: "Daily Mod Summary"
    cron: "0 0 * * *"
    actions:
      - type: "send_webhook"
        url: "https://discord.com/api/webhooks/your_webhook_id/your_webhook_token"
        message: "Daily Mod Check: Total domains flagged today is {{counter_reported_domains_count}}. Resetting counter."
      - type: "send_private_message"
        to: "your_username_here"
        subject: "Daily Moderation Summary"
        body: "Total domains flagged today is {{counter_reported_domains_count}}."
      - type: "store_value"
        key: "reported_domains_count"
        value: "0"
`
};
