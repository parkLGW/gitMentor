import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownDisplayProps {
  content: string
  className?: string
}

export function MarkdownDisplay({ content, className = '' }: MarkdownDisplayProps) {
  return (
    <div className={`markdown-display text-gray-700 space-y-2 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-base font-bold mt-2 mb-1" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-sm font-bold mt-2 mb-1" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-sm font-semibold mt-1 mb-1" {...props} />,
          p: ({ node, ...props }) => <p className="leading-relaxed" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-0.5" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-0.5" {...props} />,
          li: ({ node, ...props }) => <li {...props} />,
          code: ({ node, ...props }: any) => (
            <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-[0.92em] font-mono" {...props} />
          ),
          pre: ({ node, ...props }) => (
            <pre className="bg-gray-900 text-green-400 p-2 rounded text-xs font-mono overflow-x-auto [&_code]:bg-transparent [&_code]:text-green-400 [&_code]:p-0 [&_code]:rounded-none" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-gray-300 pl-2 italic text-xs" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a className="text-blue-600 hover:underline text-xs" target="_blank" rel="noreferrer" {...props} />
          ),
          table: ({ node, ...props }) => (
            <table className="border-collapse border border-gray-300 text-xs" {...props} />
          ),
          th: ({ node, ...props }) => <th className="border border-gray-300 px-2 py-1 bg-gray-200" {...props} />,
          td: ({ node, ...props }) => <td className="border border-gray-300 px-2 py-1" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownDisplay
