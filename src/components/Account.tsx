/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header, Icon } from "./ui";
import { ResumeUpload } from "./ResumeUpload";
import { browserClient } from "@/lib/supabase/browser";
import { SKILL_LEVELS } from "@/lib/status";

type Skill = { name: string; level: number; from_job?: string };
type LinkT = { label: string; url: string };
type Edu = { school: string; what: string; from?: string | null; to?: string | null };

const ALL_SKILLS = ["Figma", "Framer", "Adobe Illustrator", "Adobe XD", "Photoshop", "After Effects", "Canva", "Sketch", "Blender", "HTML", "CSS", "JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "Kotlin", "C++", "SQL", "Excel", "Google Sheets", "Power BI", "Tableau", "Notion", "User research", "Prototyping", "Wireframing", "Content writing", "SEO", "Social media marketing"];

async function save(patch: Record<string, unknown>) {
  await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
}

export function Account({ profile, email, left, limit, approved }: { profile: any; email: string; left: number; limit: number; approved: boolean }) {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>(profile?.skills || []);
  const [links, setLinks] = useState<LinkT[]>(profile?.links || []);
  const [edu, setEdu] = useState<Edu[]>(profile?.education || []);
  const [prefs, setPrefs] = useState({ email_ready: profile?.email_ready ?? true, email_reminders: profile?.email_reminders ?? true });
  const [addSkill, setAddSkill] = useState(false), [skillQ, setSkillQ] = useState(""), [newLevel, setNewLevel] = useState(2);
  const [addLink, setAddLink] = useState(false), [linkKind, setLinkKind] = useState("Portfolio"), [linkUrl, setLinkUrl] = useState("");
  const [addEdu, setAddEdu] = useState(false), [eduQ, setEduQ] = useState(""), [eduWhat, setEduWhat] = useState(""), [eduFrom, setEduFrom] = useState(""), [eduTo, setEduTo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = profile?.name || email;

  const upSkills = (s: Skill[]) => { setSkills(s); save({ skills: s }); };
  const upLinks = (l: LinkT[]) => { setLinks(l); save({ links: l }); };
  const upEdu = (e: Edu[]) => { setEdu(e); save({ education: e }); };

  const have = new Set(skills.map((s) => s.name.toLowerCase()));
  const sugg = skillQ.trim() ? ALL_SKILLS.filter((n) => n.toLowerCase().includes(skillQ.trim().toLowerCase()) && !have.has(n.toLowerCase())).slice(0, 5) : [];
  const schoolSugg = eduQ.trim().length >= 2
    ? [...new Set([...(profile?.resume_profile?.education || []).map((e: Edu) => e.school), ...edu.map((e) => e.school)])].filter((s) => s && s.toLowerCase().includes(eduQ.trim().toLowerCase()) && s.toLowerCase() !== eduQ.trim().toLowerCase()).slice(0, 5)
    : [];

  async function signOut() { await browserClient().auth.signOut(); router.push("/"); router.refresh(); }
  async function del() { await fetch("/api/account", { method: "DELETE" }); await browserClient().auth.signOut(); router.push("/"); }

  const SectionHead = ({ title, onAdd, addLabel }: { title: string; onAdd?: () => void; addLabel?: string }) => (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "40px 8px 0" }}>
      <h2 className="h2">{title}</h2>
      {onAdd && <button className="btn addb" onClick={onAdd}>{Icon.plus()}{addLabel}</button>}
    </div>
  );
  const Empty = ({ t, d }: { t: string; d: string }) => <div style={{ padding: "24px 20px" }}><div style={{ fontSize: 16, fontWeight: 700 }}>{t}</div><div className="mute" style={{ fontSize: 15, marginTop: 4 }}>{d}</div></div>;
  const Remove = ({ label, onClick }: { label: string; onClick: () => void }) => <button aria-label={`Remove ${label}`} onClick={onClick} style={{ width: 32, height: 32, border: 0, background: "transparent", color: "var(--mute)", cursor: "pointer", borderRadius: 10 }}>{Icon.x()}</button>;
  const formBg = { background: "#FAFAFA", flexDirection: "column" as const, alignItems: "stretch" as const, borderRadius: "0 0 28px 28px" };

  return (
    <>
      <Header signedIn initial={name[0]} />
      <main className="wrap">
        <div style={{ margin: "0 8px", display: "flex", alignItems: "center", gap: 16 }}>
          <span className="av" style={{ width: 64, height: 64, borderRadius: 24, fontSize: 26, fontWeight: 800 }}>{name[0]?.toUpperCase()}</span>
          <div><h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: "-.03em" }}>{profile?.name || "Your account"}</h1><div className="mute" style={{ fontSize: 15 }}>{email} · {approved ? `${left} of ${limit} searches left` : "Waiting for approval"}</div></div>
        </div>

        <SectionHead title="Your resume" />
        <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>We use it for every new job you paste.</p>
        <ResumeUpload signedIn current={profile?.resume_profile?.file_name || (profile?.resume_text ? "Your resume" : undefined)} />

        <SectionHead title="Skills" onAdd={() => { setAddSkill(true); setSkillQ(""); }} addLabel="Add a skill" />
        <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>We only add a skill to your resume if you&apos;ve at least used it in a project.</p>
        <div className="card" style={{ marginTop: 12 }}>
          {!skills.length && !addSkill && <Empty t="No skills yet" d="Add the tools and skills you know. You'll also get asked about skills a job needs." />}
          {skills.map((k, i) => (
            <div className="row" key={k.name}>
              <div style={{ flex: "1 1 180px", minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{k.name}</span>
                {k.from_job && <span title={`You told us about this when we asked for the ${k.from_job} job.`} aria-label={`You told us about this when we asked for the ${k.from_job} job.`} tabIndex={0} style={{ color: "var(--mute)", display: "inline-grid", placeItems: "center", width: 28, height: 28, cursor: "help" }}>{Icon.info()}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span aria-hidden style={{ display: "inline-flex", gap: 3, alignItems: "flex-end" }}>{[1, 2, 3, 4, 5].map((n) => <i key={n} style={{ display: "block", width: 5, height: 6 + n * 3, borderRadius: 2, background: n <= k.level ? "var(--ink)" : "#E5E5EA" }} />)}</span>
                <label htmlFor={`lv${i}`} className="sr">Level for {k.name}</label>
                <select id={`lv${i}`} className="sel" value={k.level} onChange={(e) => upSkills(skills.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))}>
                  {SKILL_LEVELS.map((l, n) => n > 0 && <option key={n} value={n}>{n} · {l}</option>)}
                  <option value={0}>Never used it</option>
                </select>
                <Remove label={k.name} onClick={() => upSkills(skills.filter((_, j) => j !== i))} />
              </div>
            </div>
          ))}
          {addSkill && (
            <div className="row" style={formBg}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <label htmlFor="ns" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Skill or tool</label>
                  <input id="ns" className="in" style={{ width: "100%" }} placeholder="e.g. Figma, Python, Excel" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} autoComplete="off" />
                  {sugg.length > 0 && <div className="card" style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>{sugg.map((n) => <button key={n} className="mi" style={{ width: "100%", borderRadius: 0 }} onClick={() => setSkillQ(n)}>{n}</button>)}</div>}
                </div>
                <div style={{ flex: "0 1 220px" }}>
                  <label htmlFor="nl" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Level</label>
                  <select id="nl" className="sel" style={{ width: "100%" }} value={newLevel} onChange={(e) => setNewLevel(Number(e.target.value))}>{SKILL_LEVELS.map((l, n) => n > 0 && <option key={n} value={n}>{n} · {l}</option>)}</select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn dark" disabled={!skillQ.trim()} onClick={() => { upSkills([...skills.filter((s) => s.name.toLowerCase() !== skillQ.trim().toLowerCase()), { name: skillQ.trim(), level: newLevel }]); setAddSkill(false); }}>Add skill</button>
                <button className="btn ghost" onClick={() => setAddSkill(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <SectionHead title="Portfolio and links" onAdd={() => { setAddLink(true); setLinkUrl(""); }} addLabel="Add a link" />
        <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>We put the first one in your emails so people can see your work.</p>
        <div className="card" style={{ marginTop: 12 }}>
          {!links.length && !addLink && <Empty t="No links yet" d="Add your portfolio, Behance, GitHub or anything that shows your work." />}
          {links.map((l, i) => (
            <div className="row" key={i}>
              <span className="tile" style={{ width: 40, height: 40, background: "var(--bg)" }}>{Icon.link(20)}</span>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{l.label}</div><div className="mute" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</div></div>
              <Remove label={l.label} onClick={() => upLinks(links.filter((_, j) => j !== i))} />
            </div>
          ))}
          {addLink && (
            <div className="row" style={formBg}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "0 1 200px" }}><label htmlFor="lk" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>What is it?</label><select id="lk" className="sel" style={{ width: "100%" }} value={linkKind} onChange={(e) => setLinkKind(e.target.value)}>{["Portfolio", "Behance", "Dribbble", "GitHub", "LinkedIn", "Other"].map((k) => <option key={k}>{k}</option>)}</select></div>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}><label htmlFor="lu" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Link</label><input id="lu" className="in" style={{ width: "100%" }} placeholder="yourname.com" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn dark" disabled={!linkUrl.trim()} onClick={() => { upLinks([...links, { label: linkKind, url: linkUrl.trim() }]); setAddLink(false); }}>Add link</button>
                <button className="btn ghost" onClick={() => setAddLink(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <SectionHead title="Education" onAdd={() => { setAddEdu(true); setEduQ(""); setEduWhat(""); setEduFrom(""); setEduTo(""); }} addLabel="Add education" />
        <p className="mute" style={{ margin: "4px 8px 0", fontSize: 14 }}>Add every school and college, newest first. You can add as many as you need.</p>
        <div className="card" style={{ marginTop: 12 }}>
          {!edu.length && !addEdu && <Empty t="No education yet" d="Add your college, and your school if you like." />}
          {edu.map((e, i) => (
            <div className="row" key={i}>
              <span className="tile" style={{ width: 40, height: 40, background: "#E8F0FB", color: "#164A88" }}><svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 9L12 4.5 21.5 9 12 13.5z" /><path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11" /></svg></span>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{e.school}</div><div className="mute" style={{ fontSize: 14 }}>{[e.what, [e.from, e.to].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</div></div>
              <Remove label={e.school} onClick={() => upEdu(edu.filter((_, j) => j !== i))} />
            </div>
          ))}
          {addEdu && (
            <div className="row" style={formBg}>
              <div><label htmlFor="es" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>School or college</label><input id="es" className="in" style={{ width: "100%" }} placeholder="Start typing its name" value={eduQ} onChange={(e) => setEduQ(e.target.value)} autoComplete="off" />
                {schoolSugg.length > 0 && <div className="card" style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>{schoolSugg.map((n) => <button key={n} className="mi" style={{ width: "100%", borderRadius: 0 }} onClick={() => setEduQ(n)}>{n}</button>)}</div>}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}><label htmlFor="ew" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Degree or class</label><input id="ew" className="in" style={{ width: "100%" }} placeholder="e.g. B.Des, Class 12 (Science)" value={eduWhat} onChange={(e) => setEduWhat(e.target.value)} /></div>
                <div style={{ flex: "0 1 110px" }}><label htmlFor="ef" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>From</label><input id="ef" className="in" style={{ width: "100%" }} inputMode="numeric" placeholder="2023" value={eduFrom} onChange={(e) => setEduFrom(e.target.value)} /></div>
                <div style={{ flex: "0 1 110px" }}><label htmlFor="et" style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>To</label><input id="et" className="in" style={{ width: "100%" }} inputMode="numeric" placeholder="2027" value={eduTo} onChange={(e) => setEduTo(e.target.value)} /></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn dark" disabled={!eduQ.trim()} onClick={() => { upEdu([{ school: eduQ.trim(), what: eduWhat.trim(), from: eduFrom || null, to: eduTo || null }, ...edu]); setAddEdu(false); }}>Add</button>
                <button className="btn ghost" onClick={() => setAddEdu(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {process.env.NEXT_PUBLIC_EMAILS === "on" && (<>
        <SectionHead title="Emails from us" />
        <div className="card" style={{ marginTop: 12 }}>
          {([["email_ready", "When we've finished looking into a job"], ["email_reminders", "Reminders to apply and follow up"]] as const).map(([k, label]) => (
            <label key={k} className="row" style={{ cursor: "pointer" }}>
              <span style={{ flex: 1, fontSize: 16 }}>{label}</span>
              <input type="checkbox" checked={prefs[k]} onChange={(e) => { const v = e.target.checked; setPrefs({ ...prefs, [k]: v }); save({ [k]: v }); }} style={{ width: 22, height: 22, accentColor: "#1E7A47" }} />
            </label>
          ))}
        </div>
        </>)}

        <div className="card" style={{ marginTop: 32 }}>
          <button className="row" style={{ width: "100%", border: 0, background: "none", textAlign: "left", fontSize: 16, fontWeight: 700, cursor: "pointer" }} onClick={signOut}>Sign out</button>
          {!confirmDelete ? (
            <button className="row" style={{ width: "100%", border: 0, borderTop: "1px solid var(--line)", background: "none", textAlign: "left", fontSize: 16, fontWeight: 700, color: "var(--red)", cursor: "pointer" }} onClick={() => setConfirmDelete(true)}>Delete my account and data</button>
          ) : (
            <div className="row" style={{ borderTop: "1px solid var(--line)" }}>
              <span style={{ flex: "1 1 240px", fontSize: 15 }}>This deletes your resume, jobs and messages for good.</span>
              <button className="btn" style={{ background: "var(--red)", color: "#fff" }} onClick={del}>Yes, delete everything</button>
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
