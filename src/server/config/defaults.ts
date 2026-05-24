export const BUILT_IN_TEMPLATES = {
  'Basic Spam Filter': `version: "1"
name: "Basic Spam Filter"
description: "Ban new accounts posting links"
settings:
  enable_action_log: true
  dry_run_mode: false
rules:
  - name: "Ban new link-posting accounts"
    trigger:
      event: "PostSubmit"
    conditions:
      - field: "author_age_days"
        operator: "<"
        value: 7
      - field: "author_karma"
        operator: "<"
        value: 50
      - field: "post_link_type"
        operator: "=="
        value: "link"
    actions:
      - type: remove_post
        spam: true
      - type: ban_user
        duration: "permanent"
        reason: "Spam account"
`,
  'Report Threshold Lock': `version: "1"
name: "Report Threshold Lock"
description: "Lock posts with 5+ reports and negative score"
rules:
  - name: "Lock high-report low-score posts"
    trigger:
      event: "PostReport"
    conditions:
      - field: "post_report_count"
        operator: ">"
        value: 5
      - field: "post_score"
        operator: "<"
        value: 0
    actions:
      - type: lock_post
      - type: submit_comment
        text: "Post locked pending review."
        distinguish: true
        sticky: true
`,
  'Trusted User Auto-approve': `version: "1"
name: "Trusted User Auto-approve"
description: "Approve posts from flair-marked users"
rules:
  - name: "Auto-approve trusted flair"
    trigger:
      event: "PostSubmit"
    conditions:
      - field: "author_has_user_flair"
        operator: "=="
        value: "Trusted Contributor"
    actions:
      - type: approve_post
`,
  'Ban Appeal Handler': `version: "1"
name: "Ban Appeal Handler"
description: "Auto-reply to ban appeal modmails"
rules:
  - name: "Auto-respond to ban appeals"
    trigger:
      event: "ModMail"
    conditions:
      - field: "modmail_subject"
        operator: "regex"
        value: "(?i)(appeal|unban)"
      - field: "author_is_banned"
        operator: "=="
        value: true
    actions:
      - type: reply_modmail
        text: |
          Thank you u/{{author}}. Your appeal has been received.
          Please explain why you believe the ban was incorrect.
        hidden: true
`,
  'Domain Blacklist': `version: "1"
name: "Domain Blacklist"
description: "Remove posts from specific domains + tag domain"
rules:
  - name: "Blacklist bad domains"
    trigger:
      event: "PostSubmit"
    conditions:
      - field: "post_domain"
        operator: "regex"
        value: ".*\\\\.ru$"
    actions:
      - type: remove_post
      - type: tag_domain
        domain: "{{post_domain}}"
        label: "Blacklisted"
        color: "red"
`,
  'Low Quality Warning': `version: "1"
name: "Low Quality Warning"
description: "Warn users posting below karma threshold, or remove if very low"
rules:
  - name: "Warn low karma"
    trigger:
      event: "PostSubmit"
    conditions:
      - field: "author_karma"
        operator: "<"
        value: 10
    actions:
      - type: submit_comment
        text: "Hi u/{{author | lowercase}}, please ensure your post meets our quality standards."
        distinguish: true
    fallback_actions:
      - type: delay
        duration_ms: 1000
`
};
