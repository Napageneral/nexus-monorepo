import { CheckIcon, CopyIcon } from "lucide-react";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

function MarkdownCodeBlock(props: { code: string; className?: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <div className="chat-markdown-codeblock">
      <button
        aria-label={isCopied ? "Copied" : "Copy code"}
        className="chat-markdown-copy-button"
        onClick={() => copyToClipboard(props.code)}
        title={isCopied ? "Copied" : "Copy code"}
        type="button"
      >
        {isCopied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      </button>
      <pre>
        <code className={props.className}>{props.code}</code>
      </pre>
    </div>
  );
}

export const ChatMarkdown = memo(function ChatMarkdown(props: {
  text: string;
  cwd?: string;
  isStreaming?: boolean;
}) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        components={{
          a({ href, ...anchorProps }) {
            return (
              <a
                {...anchorProps}
                href={href}
                rel="noreferrer"
                target="_blank"
              />
            );
          },
          code({ className, children }) {
            const code = String(children).replace(/\n$/, "");
            const isInline = !className;
            if (isInline) {
              return <code className={className}>{children}</code>;
            }
            return <MarkdownCodeBlock className={className} code={code} />;
          },
        }}
        remarkPlugins={[remarkGfm]}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  );
});
