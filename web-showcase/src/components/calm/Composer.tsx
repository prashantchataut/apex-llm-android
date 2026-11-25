"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useImperativeHandle, useRef, useState, type Ref } from "react";
import { readAttachment, TEXT_ACCEPT, type Attachment } from "@/lib/attachments";
import { SKILLS, toggleSkill, useSkills } from "@/lib/skills";
import { useVoice } from "@/components/app/useVoice";
import { CIcon, Glyph } from "./icons";

export interface ComposerHandle {
  attach: () => void;
  voice: () => void;
  focus: () => void;
}

interface Props {
  ref?: Ref<ComposerHandle>;
  compact: boolean;
  value: string;
  setValue: (v: string) => void;
  busy: boolean;
  onStop: () => void;
  onSend: (text: string, atts: Attachment[], voiceMs?: number) => void;
  imageMode: boolean;
  setImageMode: (v: boolean) => void;
  statusLeft: string;
  statusIcon?: "bolt" | "lock";
  statusRight: { label: string; onClick: () => void };
  onOpenMcp: () => void;
}

/**
 * Unified Halo Composer. Home state: a two-line card with every action tucked inside its bottom-left and a status strip on top.
 * After the first message it compacts into a single input pill (+ / mic / send) so the conversation gets the height.
 */
export function Composer({ ref, compact, value, setValue, busy, onStop, onSend, imageMode, setImageMode, statusLeft, statusIcon = "bolt", statusRight, onOpenMcp }: Props) {
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState<null | "skills" | "plus">(null);
  const skills = useSkills();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const t0 = useRef(0);
  const spoken = useRef<{ text: string; ms: number } | null>(null);

  const commitVoice = useCallback(
    (text: string) => {
      spoken.current = { text: text.trim(), ms: Math.max(1000, performance.now() - t0.current) };
      setValue(value ? `${value} ${text}` : text);
    },
    [setValue, value],
  );
  const { voice, toggleVoice } = useVoice(commitVoice);
  const toggleMic = () => {
    if (!voice.recording) t0.current = performance.now();
    void toggleVoice();
  };

  useImperativeHandle(ref, () => ({ attach: () => fileRef.current?.click(), voice: toggleMic, focus: () => textRef.current?.focus() }));

  const pick = async (files: FileList | null, kind: "text" | "image") => {
    if (!files) return;
    const read = await Promise.all([...files].slice(0, 4).map((f) => readAttachment(f, kind)));
    setAtts((a) => [...a, ...read]);
    setMenu(null);
  };

  const canSend = (value.trim().length > 0 || atts.length > 0) && !voice.recording;
  const submit = () => {
    if (busy || !canSend) return;
    const ms = spoken.current && spoken.current.text === value.trim() ? spoken.current.ms : undefined;
    onSend(value, atts, ms);
    setValue("");
    setAtts([]);
    setMenu(null);
    spoken.current = null;
    if (textRef.current) textRef.current.style.height = "";
  };
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const placeholder = imageMode ? "Describe the image you want…" : compact ? "Message Apex…" : "Describe your task or ask anything...";
  const field = (rows: number) => (
    <textarea
      ref={textRef}
      value={value}
      rows={rows}
      aria-label="Message"
      placeholder={busy ? "Apex is answering…" : placeholder}
      onChange={(e) => {
        setValue(e.target.value);
        grow(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          submit();
        }
      }}
      className="bare min-h-[24px] w-full flex-1 resize-none bg-transparent text-[15.5px] leading-6 outline-none placeholder:text-[rgb(var(--ink-rgb)/0.42)]"
    />
  );

  const sendBtn = busy ? (
    <button type="button" onClick={onStop} aria-label="Stop generating" className="send">
      <CIcon name="stop" size={15} />
    </button>
  ) : (
    <button type="button" onClick={submit} disabled={!canSend} aria-label="Send" className="send">
      <CIcon name="up" size={18} />
    </button>
  );

  const chips = (atts.length > 0 || imageMode || voice.recording || voice.busy || voice.notice) && (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {imageMode && (
        <span className="calm-chip" style={{ background: "var(--halo-a)", color: "var(--halo-ink)", borderColor: "transparent" }}>
          <CIcon name="palette" size={13} /> Image mode
          <button type="button" aria-label="Turn off image mode" onClick={() => setImageMode(false)} className="-mr-1 grid h-5 w-5 place-items-center rounded-full">
            <CIcon name="x" size={12} />
          </button>
        </span>
      )}
      {atts.map((a) => (
        <span key={a.id} className="calm-chip" title={a.error ?? `${a.tokens} tokens`}>
          <CIcon name={a.kind === "image" ? "image" : "file"} size={13} /> <span className="max-w-[120px] truncate">{a.name}</span>
          {a.error ? <span className="text-[var(--bad)]">!</span> : <span className="tnum opacity-60">~{a.tokens}</span>}
          <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))} className="-mr-1 grid h-5 w-5 place-items-center rounded-full">
            <CIcon name="x" size={12} />
          </button>
        </span>
      ))}
      {voice.recording && (
        <span className="calm-chip" style={{ color: "var(--bad)" }}>
          <span className="pulse-dot h-2 w-2 rounded-full bg-current" /> Listening… tap the mic to finish{voice.transcript ? ` · “${voice.transcript.slice(-40)}”` : ""}
        </span>
      )}
      {voice.busy && <span className="calm-chip">Transcribing…</span>}
      {!voice.recording && !voice.busy && voice.notice && <span className="calm-chip max-w-full truncate">{voice.notice}</span>}
    </div>
  );

  const skillsMenu = (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="pop absolute bottom-full left-0 right-0 z-20 mb-2 max-h-[52dvh] overflow-y-auto" role="menu" aria-label="Skills">
      {SKILLS.map((s) => {
        const on = skills.includes(s.id);
        return (
          <button key={s.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggleSkill(s.id)} className="pop-row">
            <span className="pop-ico"><Glyph e={s.emoji} size={16} /></span>
            <span className="min-w-0 flex-1"><span className="t block truncate">{s.name}</span><span className="d truncate">{s.desc.split(". ")[0]}</span></span>
            <span className="switch" role="presentation" aria-checked={on} />
          </button>
        );
      })}
      <button type="button" onClick={onOpenMcp} className="pop-row text-[13px] text-[var(--accent)]">
        <CIcon name="plug" size={16} /> MCP servers &amp; skills…
      </button>
    </motion.div>
  );

  const plusMenu = (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="pop absolute bottom-full left-0 z-20 mb-2 w-[min(292px,100%)]" role="menu" aria-label="Add">
      {[
        { l: "Attach file", d: "PDF, code, markdown, text", i: "clip" as const, f: () => fileRef.current?.click() },
        { l: "Add photo", d: "Describe or analyze an image", i: "image" as const, f: () => photoRef.current?.click() },
        { l: imageMode ? "Image mode is on" : "Image mode", d: "Next message becomes a picture", i: "palette" as const, f: () => { setImageMode(!imageMode); setMenu(null); } },
        { l: "Skills & tools", d: "Web, GitHub, sandbox, memory", i: "wand" as const, f: () => setMenu("skills") },
      ].map((x) => (
        <button key={x.l} type="button" role="menuitem" onClick={x.f} className="pop-row">
          <span className="pop-ico"><CIcon name={x.i} size={16} /></span>
          <span className="min-w-0"><span className="t block">{x.l}</span><span className="d">{x.d}</span></span>
        </button>
      ))}
    </motion.div>
  );

  return (
    <div className="relative">
      <input ref={fileRef} type="file" multiple accept={TEXT_ACCEPT} hidden onChange={(e) => { void pick(e.target.files, "text"); e.target.value = ""; }} />
      <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files, "image"); e.target.value = ""; }} />
      <AnimatePresence>{menu === "skills" && skillsMenu}</AnimatePresence>
      <AnimatePresence>{menu === "plus" && plusMenu}</AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {compact ? (
          <motion.div key="compact" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
            {chips}
            <div className="dock-pill beam" data-live={busy}>
              <button type="button" className="ibtn" aria-label="Add attachment, image mode or skills" aria-expanded={menu === "plus"} data-on={menu === "plus"} onClick={() => setMenu(menu === "plus" ? null : "plus")}>
                <CIcon name="plus" size={20} style={{ transform: menu === "plus" ? "rotate(45deg)" : undefined, transition: "transform .2s" }} />
              </button>
              <div className="flex min-h-[38px] flex-1 items-center py-1.5">{field(1)}</div>
              <button type="button" className="ibtn" aria-label={voice.recording ? "Stop recording" : "Voice input"} data-on={voice.recording} onClick={toggleMic}>
                <CIcon name="mic" size={19} />
              </button>
              {sendBtn}
            </div>
          </motion.div>
        ) : (
          <motion.div key="home" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ type: "spring", stiffness: 380, damping: 34 }} className="halo beam" data-live={busy}>
            <div className="halo-strip">
              <span className="flex min-w-0 items-center gap-1.5"><CIcon name={statusIcon} size={13} className="shrink-0" /><span className="truncate">{statusLeft}</span></span>
              <button type="button" onClick={statusRight.onClick} className="calm-chip !h-8 shrink-0 !bg-[var(--surface)] !text-[var(--halo-ink)]">
                {statusRight.label}
              </button>
            </div>
            <div className="halo-inner">
              {chips}
              {field(2)}
              <div className="mt-2 flex items-center gap-0.5">
                <button type="button" className="ibtn" aria-label="Attach file or photo" onClick={() => fileRef.current?.click()}>
                  <CIcon name="clip" size={19} />
                </button>
                <button type="button" className="ibtn" aria-label="Image mode" aria-pressed={imageMode} data-on={imageMode} onClick={() => setImageMode(!imageMode)}>
                  <CIcon name="image" size={19} />
                </button>
                <button type="button" className="ibtn" aria-label="Skills and MCP" aria-expanded={menu === "skills"} data-on={menu === "skills"} onClick={() => setMenu(menu === "skills" ? null : "skills")}>
                  <CIcon name="wand" size={19} />
                </button>
                <button type="button" className="ibtn" aria-label={voice.recording ? "Stop recording" : "Voice input"} data-on={voice.recording} onClick={toggleMic}>
                  <CIcon name="mic" size={19} />
                </button>
                <span className="flex-1" />
                {sendBtn}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
