# Security

Ant runs AI agents on your computer with your Claude subscription, so its safety layers matter. Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue for security problems.

Especially interesting:

- An ant reaching Ant's own API or UI (it could approve itself), escaping its folder or the OS sandbox, or reading credentials.
- Getting past the approval floors, rules or the "send only the approved text" draft check.
- Pairing or session bypasses that let an unpaired device use antd.
- Prompt injection from web pages, email, Slack or GitHub events that leads to an action without approval.

See the "Safety model" section of the README for what each layer is meant to do.
