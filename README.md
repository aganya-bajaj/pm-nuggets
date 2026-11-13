# PM Nuggets

An Android app that works like a TV box: the APK is the player, and everything it shows comes from the `content/` folder in this repo.

**Install:** [download the latest APK](https://github.com/aganya-bajaj/pm-nuggets/releases/latest/download/pm-nuggets.apk) on your phone and open it.

## How it works

- `content/config.json` lists the tabs and the reminders.
- The app syncs `content/` from GitHub when you open it (and again when you come back to it after 30 minutes). It keeps a copy on the phone and works offline from that copy.
- Reminders are scheduled on the phone itself as local Android alarms, so they fire on time with no server. They're rescheduled after every sync, so changing a time here changes it on the phone.
- Your progress (finished nuggets, ticked items) is stored only on the phone.
- Editing anything in `content/` needs no new APK. Changing `app/` rebuilds the APK automatically (see Releases).

## config.json

```json
{
  "version": 1,
  "app": { "title": "PM Nuggets" },
  "tabs": [
    { "id": "nuggets", "title": "Nuggets", "icon": "cards", "type": "deck", "source": "nuggets.json" }
  ],
  "reminders": [
    { "id": "nightly", "enabled": true, "time": "23:00",
      "title": "2 min of PM prep", "body": "Tonight: {next}", "tab": "nuggets" }
  ]
}
```

Tabs appear in the order listed, and Settings is always added last. Keep each `id` stable, because progress is saved per tab id.

### Tab types

| type | source file | what it shows |
|---|---|---|
| `deck` | JSON: `{title, subtitle, minutes, categories: {key: {name, color}}, items: [{cat, title, body, drill, answer}]}` | Nugget cards with a reader, timer, drill and progress. `body`, `drill` and `answer` are HTML. |
| `checklist` | JSON: `{title, subtitle, sections: [{title, items: ["..."]}]}` | A tickable list with progress |
| `links` | JSON: `{title, subtitle, links: [{title, url, note}]}` | Links that open in the browser |
| `markdown` | a `.md` file | A formatted article or cheat sheet |
| `html` | an `.html` file | Any custom feature with its own HTML, CSS and JS. Works offline. |
| `web` | none; set `"url"` instead | Any web page. Needs internet. |

Icons: `cards`, `check`, `list`, `book`, `link`, `globe`, `code`, `star`, `chart`, `bulb`, `calendar`.

### Reminders

- `time`: 24-hour time on the phone, e.g. `"23:00"`.
- `body`: `{next}` becomes the title of the next unread item when `tab` points to a `deck`.
- `tab`: tapping the notification opens this tab, and the nugget itself for decks.
- `enabled: false` turns a reminder off everywhere. Each reminder can also be switched off in the app's Settings.

## Repo layout

- `content/`: everything the app shows. Edit freely.
- `app/www/`: the app shell (HTML, CSS, JS).
- `app/android/`: the Android project (Capacitor).
- `.github/workflows/build-apk.yml`: builds the APK and publishes it to Releases.

## Signing

The signing key is never stored in the repo. Builds read it from two repository secrets, `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. Without them, a build uses a throwaway key. That APK installs fine, but a later APK can't update it in place, so you'd have to uninstall first and would lose your progress.
