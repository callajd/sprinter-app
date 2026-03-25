import { DiffEditor, type Monaco } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { useDiffStore } from "@/diffStore";
import { Columns2, Rows2, Loader2 } from "lucide-react";

const THEME_DARK = "sprinter-diff-dark";
const THEME_LIGHT = "sprinter-diff-light";

function defineThemes(monaco: Monaco) {
  // Dark: inherit vs-dark defaults, only warm up the diff backgrounds slightly
  monaco.editor.defineTheme(THEME_DARK, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      // Inserted — default green, slightly warmer
      "diffEditor.insertedTextBackground": "#9bb95540",
      "diffEditor.insertedLineBackground": "#9bb95520",
      "diffEditorGutter.insertedLineBackground": "#9bb95540",

      // Removed — default red, slightly warmer/softer
      "diffEditor.removedTextBackground": "#c5524840",
      "diffEditor.removedLineBackground": "#c5524820",
      "diffEditorGutter.removedLineBackground": "#c5524840",
    },
  });

  // Light: inherit vs defaults, only warm up the diff backgrounds slightly
  monaco.editor.defineTheme(THEME_LIGHT, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      // Inserted — warm green tint
      "diffEditor.insertedTextBackground": "#9bb95540",
      "diffEditor.insertedLineBackground": "#9bb95518",
      "diffEditorGutter.insertedLineBackground": "#9bb95540",

      // Removed — warm rose tint
      "diffEditor.removedTextBackground": "#c5524840",
      "diffEditor.removedLineBackground": "#c5524818",
      "diffEditorGutter.removedLineBackground": "#c5524840",
    },
  });
}

function useAppTheme(): string {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark")
      ? THEME_DARK
      : THEME_LIGHT;
  }
  return THEME_DARK;
}

export function DiffEditorPanel() {
  const selectedFile = useDiffStore((s) => s.selectedFile);
  const originalContent = useDiffStore((s) => s.originalContent);
  const modifiedContent = useDiffStore((s) => s.modifiedContent);
  const language = useDiffStore((s) => s.language);
  const inlineMode = useDiffStore((s) => s.inlineMode);
  const isLoadingContent = useDiffStore((s) => s.isLoadingContent);
  const toggleInlineMode = useDiffStore((s) => s.toggleInlineMode);
  const theme = useAppTheme();

  if (!selectedFile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          Select a file to view diff
        </p>
      </div>
    );
  }

  if (isLoadingContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
        <span className="font-mono text-sm truncate text-foreground">
          {selectedFile}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={toggleInlineMode}
          title={inlineMode ? "Side by side" : "Inline"}
        >
          {inlineMode ? <Columns2 className="size-3.5" /> : <Rows2 className="size-3.5" />}
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <DiffEditor
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme={theme}
          beforeMount={defineThemes}
          options={{
            readOnly: true,
            renderSideBySide: !inlineMode,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            fontFamily: "SF Mono, Cascadia Code, Fira Code, Menlo, monospace",
          }}
          originalModelPath={`original/${selectedFile}`}
          modifiedModelPath={`modified/${selectedFile}`}
          loading={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          }
        />
      </div>
    </div>
  );
}
