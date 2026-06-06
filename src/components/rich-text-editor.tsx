import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect, useState } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Heading2, Quote, Undo, Redo, Code2, Eye } from "lucide-react";

interface Props {
  value: string;          // HTML
  onChange: (html: string, json: unknown) => void;
  placeholder?: string;
  minHeight?: number;
  /** Allow toggling to raw HTML source editing. Defaults to true. */
  allowHtmlSource?: boolean;
}

function Toolbar({
  editor,
  mode,
  onToggleMode,
  allowHtmlSource,
}: {
  editor: Editor | null;
  mode: "visual" | "html";
  onToggleMode: () => void;
  allowHtmlSource: boolean;
}) {
  const btn = (active: boolean) =>
    `h-8 w-8 inline-flex items-center justify-center rounded text-sm ${active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`;
  const disabled = mode === "html" || !editor;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 px-2 py-1">
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("heading", { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("link"))} onClick={() => {
        if (!editor) return;
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL", prev ?? "https://");
        if (url === null) return;
        if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
        else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      }}><Link2 className="h-4 w-4" /></button>
      <div className="ml-auto flex gap-1 items-center">
        {allowHtmlSource && (
          <button
            type="button"
            onClick={onToggleMode}
            className={`h-8 px-2 inline-flex items-center gap-1 rounded text-xs ${mode === "html" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
            title={mode === "html" ? "Switch to visual editor" : "Edit raw HTML"}
          >
            {mode === "html" ? <><Eye className="h-3.5 w-3.5" /> Visual</> : <><Code2 className="h-3.5 w-3.5" /> HTML</>}
          </button>
        )}
        <button type="button" disabled={disabled} className={btn(false)} onClick={() => editor?.chain().focus().undo().run()}><Undo className="h-4 w-4" /></button>
        <button type="button" disabled={disabled} className={btn(false)} onClick={() => editor?.chain().focus().redo().run()}><Redo className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 200, allowHtmlSource = true }: Props) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [htmlDraft, setHtmlDraft] = useState(value || "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
    ],
    content: value || "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getJSON()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-4 py-3 focus:outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (mode !== "visual") return;
    const current = editor.getHTML();
    if (value !== current && !editor.isFocused) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor, mode]);

  function toggleMode() {
    if (mode === "visual") {
      setHtmlDraft(editor?.getHTML() ?? value ?? "");
      setMode("html");
    } else {
      // Push raw HTML back to parent and rehydrate visual editor on next render.
      onChange(htmlDraft, null);
      editor?.commands.setContent(htmlDraft || "", { emitUpdate: false });
      setMode("visual");
    }
  }

  return (
    <div className="rounded-md border bg-white">
      <Toolbar editor={editor} mode={mode} onToggleMode={toggleMode} allowHtmlSource={allowHtmlSource} />
      {mode === "visual" ? (
        <EditorContent editor={editor} placeholder={placeholder} />
      ) : (
        <textarea
          value={htmlDraft}
          onChange={(e) => {
            setHtmlDraft(e.target.value);
            onChange(e.target.value, null);
          }}
          spellCheck={false}
          className="w-full font-mono text-xs px-4 py-3 focus:outline-none resize-y"
          style={{ minHeight }}
          placeholder="<html>…</html>"
        />
      )}
    </div>
  );
}

export default RichTextEditor;
