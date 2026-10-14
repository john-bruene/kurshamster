#!/usr/bin/env python3
"""
studip_backup.py - sichert Dateien und Nachrichten aus Stud.IP (Uni Göttingen) über die JSON:API.

Installation:
    pip install requests

Nutzung:
    export STUDIP_COOKIE='Studip_Session=...'       # Cookie der eingeloggten Browser-Sitzung
    python studip_backup.py --dry-run               # nur auflisten, nichts herunterladen
    python studip_backup.py --out ~/StudIP-Backup   # alles sichern
    python studip_backup.py --course Statistik      # nur Kurse, deren Titel "Statistik" enthält

Ergebnis:
    <out>/<Semester>/<Kursnummer Kurstitel>/<Ordner>/<Datei>
    <out>/_Meine Dateien/...
    <out>/_Nachrichten/inbox|outbox/*.md  (+ messages.jsonl mit Rohdaten)
    <out>/_index.json   (Metadaten aller Kurse und Dateien)
    <out>/_fehler.txt   (alles, was nicht geladen werden konnte)

Der Cookie wird nirgends gespeichert. Läuft die Sitzung ab, neuen Cookie holen und
das Skript erneut starten: Bereits vollständige Dateien werden übersprungen.
"""

import argparse
import getpass
import html
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

HOST = "https://studip.uni-goettingen.de"
API = HOST + "/jsonapi.php/v1/"
PAUSE = 0.3          # Sekunden zwischen Anfragen, um den Server zu schonen
PAGE_LIMIT = 100


class SessionExpired(Exception):
    pass


# --------------------------------------------------------------------------- HTTP

def make_session(cookie: str) -> requests.Session:
    cookie = cookie.strip()
    if cookie.lower().startswith("cookie:"):
        cookie = cookie[7:].strip()
    if "=" not in cookie:                      # nur der Wert wurde eingefügt
        cookie = f"Studip_Session={cookie}; Seminar_Session={cookie}"
    s = requests.Session()
    s.headers.update({
        "Cookie": cookie,
        "Accept": "application/vnd.api+json",
        "User-Agent": "studip-backup (persoenliches Archiv)",
    })
    return s


def session_from_curl(path: str) -> requests.Session:
    """Übernimmt alle Header aus einem 'Copy as cURL' der Browser-Entwicklertools."""
    import shlex
    text = Path(path).expanduser().read_text(encoding="utf-8").replace("\\\n", " ")
    tokens = shlex.split(text)
    s = requests.Session()
    skip = {"accept-encoding", "content-length", "host", "connection"}
    for i, t in enumerate(tokens[:-1]):
        val = tokens[i + 1]
        if t in ("-H", "--header") and ":" in val:
            name, v = val.split(":", 1)
            if name.strip().lower() not in skip:
                s.headers[name.strip()] = v.strip()
        elif t in ("-b", "--cookie"):
            s.headers["Cookie"] = val
    if "Cookie" not in s.headers:
        sys.exit("In der cURL-Datei wurde kein Cookie gefunden.")
    s.headers["Accept"] = "application/vnd.api+json"
    return s


def absolute(url: str) -> str:
    if url.startswith("http"):
        return url
    if url.startswith("/"):
        return HOST + url
    return API + url


def get_json(s, url, params=None, tries=4):
    for attempt in range(1, tries + 1):
        time.sleep(PAUSE)
        try:
            r = s.get(absolute(url), params=params, timeout=180)
        except (requests.Timeout, requests.ConnectionError):
            if attempt == tries:
                raise
            print(f"  … Server antwortet langsam, neuer Versuch {attempt + 1}/{tries}")
            time.sleep(10 * attempt)
            continue
        if r.status_code == 401 or "text/html" in r.headers.get("Content-Type", ""):
            raise SessionExpired()
        if r.status_code in (502, 503, 504) and attempt < tries:
            time.sleep(10 * attempt)
            continue
        r.raise_for_status()
        return r.json()


def get_all(s, url, params=None, limit=PAGE_LIMIT):
    """Holt alle Seiten einer JSON:API-Liste. Gibt (data, included) zurück."""
    params = dict(params or {})
    params.setdefault("page[limit]", limit)
    params.setdefault("page[offset]", 0)
    data, included, followed_next = [], [], False
    while True:
        doc = get_json(s, url, params)
        batch = doc.get("data") or []
        if isinstance(batch, dict):
            batch = [batch]
        data.extend(batch)
        included.extend(doc.get("included") or [])
        nxt = (doc.get("links") or {}).get("next")
        total = ((doc.get("meta") or {}).get("page") or {}).get("total")
        if nxt and batch:
            url, params, followed_next = nxt, None, True
            continue
        if not followed_next and batch and total is not None and len(data) < total:
            params["page[offset]"] = len(data)
            continue
        return data, included


def get_all_include(s, url, include, limit=PAGE_LIMIT):
    """Wie get_all, versucht aber zuerst mit ?include=..., bei Fehler ohne."""
    try:
        return get_all(s, url, {"include": include}, limit)
    except requests.RequestException:
        return get_all(s, url, None, limit)


# --------------------------------------------------------------------------- Helfer

def clean(name, maxlen=100):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(name))
    name = re.sub(r"\s+", " ", name).strip(" .")
    return name[:maxlen].rstrip(" .") or "_"


def clean_filename(name, maxlen=120):
    name = clean(name, 1000)
    if len(name) <= maxlen:
        return name
    stem, dot, ext = name.rpartition(".")
    if dot and len(ext) <= 10:
        return stem[: maxlen - len(ext) - 1].rstrip(" .") + "." + ext
    return name[:maxlen]


def rel_id(obj, rel):
    d = ((obj.get("relationships") or {}).get(rel) or {}).get("data")
    if isinstance(d, dict):
        return d.get("id")
    return None


def rel_ids(obj, rel):
    d = ((obj.get("relationships") or {}).get(rel) or {}).get("data")
    if isinstance(d, list):
        return [x.get("id") for x in d]
    return [d.get("id")] if isinstance(d, dict) else []


def set_mtime(path, iso):
    try:
        ts = datetime.fromisoformat(iso).timestamp()
        os.utime(path, (ts, ts))
    except Exception:
        pass


def html_to_text(text):
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", text or "")
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


# --------------------------------------------------------------------------- Backup

class Backup:
    def __init__(self, s, out: Path, dry_run: bool):
        self.s, self.out, self.dry = s, out, dry_run
        self.index = {"courses": [], "files": []}
        self.errors = []
        self.stats = {"geladen": 0, "uebersprungen": 0, "fehler": 0, "bytes": 0}
        self.semester_cache = {}

    def err(self, msg):
        self.errors.append(msg)
        self.stats["fehler"] += 1
        print("  ! " + msg)

    # ---- Kurse
    def semester_title(self, sem_id, included):
        if not sem_id:
            return "Ohne Semester"
        for i in included:
            if i.get("type") == "semesters" and i.get("id") == sem_id:
                self.semester_cache[sem_id] = i["attributes"].get("title")
        if sem_id not in self.semester_cache:
            try:
                self.semester_cache[sem_id] = get_json(self.s, f"semesters/{sem_id}")["data"]["attributes"].get("title")
            except requests.HTTPError:
                self.semester_cache[sem_id] = None
        return self.semester_cache[sem_id] or "Unbekanntes Semester"

    def list_courses(self, uid):
        try:
            data, inc = get_all_include(self.s, f"users/{uid}/courses", "start-semester")
        except requests.HTTPError:
            data, inc = [], []
        if not data:
            _, inc = get_all_include(self.s, f"users/{uid}/course-memberships", "course")
            data = [i for i in inc if i.get("type") == "courses"]
        courses = []
        for c in data:
            a = c.get("attributes") or {}
            courses.append({
                "id": c["id"],
                "title": a.get("title") or c["id"],
                "number": a.get("course-number") or "",
                "semester": self.semester_title(rel_id(c, "start-semester"), inc),
            })
        return sorted(courses, key=lambda x: (x["semester"], x["title"]))

    # ---- Ordner
    def walk_folders(self, start_url):
        """Liefert [(folder, [pfadteile])] für alle Ordner unterhalb von start_url."""
        flat, _ = get_all(self.s, start_url)
        by_id = {f["id"]: f for f in flat}
        roots = [f for f in flat if rel_id(f, "parent") not in by_id]
        seen, out = set(), []

        def visit(f, path):
            if f["id"] in seen:
                return
            seen.add(f["id"])
            out.append((f, path))
            try:
                subs, _ = get_all(self.s, f"folders/{f['id']}/folders")
            except requests.RequestException:
                subs = []
            children = {x["id"]: x for x in subs}
            for x in flat:
                if rel_id(x, "parent") == f["id"]:
                    children.setdefault(x["id"], x)
            for c in children.values():
                visit(c, path + [clean((c.get("attributes") or {}).get("name") or "Ordner")])

        for r in roots:
            a = r.get("attributes") or {}
            is_root = a.get("folder-type") == "RootFolder" or not a.get("name")
            visit(r, [] if is_root else [clean(a.get("name"))])
        return out

    # ---- Dateien
    def download_folder(self, folder, target: Path, context):
        try:
            refs, _ = get_all(self.s, f"folders/{folder['id']}/file-refs")
        except requests.RequestException as e:
            self.err(f"{context}: Ordner nicht lesbar ({e})")
            return
        used = set()
        for ref in refs:
            a = ref.get("attributes") or {}
            name = clean_filename(a.get("name") or ref["id"])
            if name.lower() in used:                      # gleiche Namen im selben Ordner
                stem, dot, ext = name.rpartition(".")
                name = f"{stem} ({ref['id'][:6]}).{ext}" if dot else f"{name} ({ref['id'][:6]})"
            used.add(name.lower())
            dest = target / name
            size = a.get("filesize")
            self.index["files"].append({
                "context": context, "path": str(dest.relative_to(self.out)), "id": ref["id"],
                "size": size, "chdate": a.get("chdate"), "description": a.get("description"),
            })
            if dest.exists() and (size is None or dest.stat().st_size == size):
                self.stats["uebersprungen"] += 1
                continue
            if self.dry:
                print(f"    {dest.relative_to(self.out)}  ({(size or 0) / 1e6:.1f} MB)")
                continue
            if a.get("is-downloadable") is False:
                self.err(f"{context}/{name}: nicht herunterladbar")
                continue
            self.fetch_file(ref["id"], dest, a.get("chdate"), context)

    def fetch_file(self, ref_id, dest: Path, chdate, context):
        dest.parent.mkdir(parents=True, exist_ok=True)
        part = dest.with_name(dest.name + ".part")
        time.sleep(PAUSE)
        try:
            with self.s.get(absolute(f"file-refs/{ref_id}/content"), stream=True, timeout=300,
                            headers={"Accept": "*/*"}) as r:
                if r.status_code == 401 or "login" in r.url.lower():
                    raise SessionExpired()
                r.raise_for_status()
                n = 0
                with open(part, "wb") as fh:
                    for chunk in r.iter_content(1 << 16):
                        fh.write(chunk)
                        n += len(chunk)
            part.replace(dest)
            if chdate:
                set_mtime(dest, chdate)
            self.stats["geladen"] += 1
            self.stats["bytes"] += n
            print(f"    + {dest.relative_to(self.out)}")
        except SessionExpired:
            part.unlink(missing_ok=True)
            raise
        except Exception as e:
            part.unlink(missing_ok=True)
            self.err(f"{context}/{dest.name}: {e}")

    def backup_tree(self, start_url, base: Path, context):
        try:
            folders = self.walk_folders(start_url)
        except requests.RequestException as e:
            self.err(f"{context}: Dateibereich nicht lesbar ({e})")
            return
        for folder, path in folders:
            self.download_folder(folder, base.joinpath(*path), context + ("/" + "/".join(path) if path else ""))

    # ---- Nachrichten
    def backup_messages(self, uid):
        for box in ("inbox", "outbox"):
            print(f"\nNachrichten: {box}")
            try:
                msgs, inc = get_all_include(self.s, f"users/{uid}/{box}", "sender,recipients", limit=20)
            except requests.RequestException as e:
                self.err(f"Nachrichten {box}: {e}")
                continue
            names = {i["id"]: (i.get("attributes") or {}).get("formatted-name")
                     for i in inc if i.get("type") == "users"}
            d = self.out / "_Nachrichten" / box
            print(f"  {len(msgs)} Nachrichten")
            if self.dry:
                continue
            d.mkdir(parents=True, exist_ok=True)
            with open(d / "messages.jsonl", "w", encoding="utf-8") as raw:
                for m in msgs:
                    raw.write(json.dumps(m, ensure_ascii=False) + "\n")
                    a = m.get("attributes") or {}
                    date = (a.get("mkdate") or "")[:16].replace("T", " ")
                    subject = a.get("subject") or "ohne Betreff"
                    fname = clean_filename(f"{date[:10]} {subject} [{m['id'][:6]}].md")
                    sender = rel_id(m, "sender")
                    recips = [names.get(r) or r for r in rel_ids(m, "recipients")]
                    body = html_to_text(a.get("message"))
                    text = (f"# {subject}\n\n"
                            f"- Datum: {date}\n"
                            f"- Von: {names.get(sender) or sender or 'System'}\n"
                            f"- An: {', '.join(recips) or '-'}\n\n---\n\n{body}\n")
                    (d / fname).write_text(text, encoding="utf-8")

    # ---- Abschluss
    def write_reports(self):
        if self.dry:
            return
        self.out.mkdir(parents=True, exist_ok=True)
        (self.out / "_index.json").write_text(json.dumps(self.index, ensure_ascii=False, indent=1), encoding="utf-8")
        (self.out / "_fehler.txt").write_text("\n".join(self.errors) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="Stud.IP-Backup (Uni Göttingen) über die JSON:API")
    ap.add_argument("--out", default="StudIP-Backup", help="Zielordner (Standard: ./StudIP-Backup)")
    ap.add_argument("--dry-run", action="store_true", help="nur auflisten, nichts herunterladen")
    ap.add_argument("--course", help="nur Kurse, deren Titel diesen Text enthält")
    ap.add_argument("--no-messages", action="store_true", help="Nachrichten nicht sichern")
    ap.add_argument("--no-personal", action="store_true", help="'Meine Dateien' nicht sichern")
    ap.add_argument("--curl-file", help="Datei mit 'Copy as cURL' aus den Browser-Entwicklertools")
    args = ap.parse_args()

    if args.curl_file:
        s = session_from_curl(args.curl_file)
    else:
        cookie = os.environ.get("STUDIP_COOKIE") or getpass.getpass("Cookie (Eingabe wird nicht angezeigt): ")
        s = make_session(cookie)
    out = Path(args.out).expanduser()
    b = Backup(s, out, args.dry_run)

    try:
        me = get_json(s, "users/me")["data"]
    except (SessionExpired, requests.HTTPError):
        r = s.get(absolute("users/me"), timeout=60, allow_redirects=False)
        names = [c.split("=")[0].strip() for c in s.headers["Cookie"].split(";")]
        sys.exit("Login fehlgeschlagen: Cookie ungültig oder abgelaufen.\n"
                 f"  Diagnose: HTTP {r.status_code}, Content-Type {r.headers.get('Content-Type')}, "
                 f"Weiterleitung nach {r.headers.get('Location', '-')}\n"
                 f"  Gesendete Cookie-Namen: {', '.join(names)}")
    uid = me["id"]
    print(f"Eingeloggt als {me['attributes'].get('formatted-name')}\n")

    try:
        courses = b.list_courses(uid)
        if args.course:
            courses = [c for c in courses if args.course.lower() in c["title"].lower()]
        print(f"{len(courses)} Veranstaltungen gefunden")
        for c in courses:
            label = " ".join(f"{c['number']} {c['title']}".split())
            print(f"\n[{c['semester']}] {label}")
            b.index["courses"].append(c)
            b.backup_tree(f"courses/{c['id']}/folders", out / clean(c["semester"]) / clean(label), label)
        if not args.no_personal and not args.course:
            print("\nMeine Dateien")
            b.backup_tree(f"users/{uid}/folders", out / "_Meine Dateien", "Meine Dateien")
        if not args.no_messages and not args.course:
            b.backup_messages(uid)
    except SessionExpired:
        print("\nSitzung abgelaufen. Neuen Cookie holen und das Skript erneut starten;"
              " fertige Dateien werden übersprungen.")
    except KeyboardInterrupt:
        print("\nAbgebrochen. Erneut starten setzt fort.")
    except requests.RequestException as e:
        print(f"\nVerbindungsproblem ({e}). Einfach erneut starten, es geht dort weiter.")
    finally:
        b.write_reports()
        st = b.stats
        print(f"\nFertig: {st['geladen']} geladen ({st['bytes'] / 1e9:.2f} GB), "
              f"{st['uebersprungen']} übersprungen, {st['fehler']} Fehler"
              + ("" if args.dry_run else f"\nZiel: {out}"))


if __name__ == "__main__":
    main()
