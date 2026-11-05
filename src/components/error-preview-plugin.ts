import {
    definePlugin,
    ExpressiveCodeAnnotation,
    type AnnotationRenderOptions,
    type ExpressiveCodeLine,
} from '@expressive-code/core'
import { getClassNames, h, type Element } from '@expressive-code/core/hast'
import { MESSAGE, SQUIGGLES } from './error-preview.ts'

/**
 * Shows errors in the code blocks whose meta says `error-preview`: `~~code~~` squiggles `code`,
 * and a `//! message` comment shows `message` at the end of its line, as the compiler might.
 *
 * Both are markup, not code: the block's text, which is what the reader copies and what a
 * `<Playground>` compiles, is the code without them. The message is not in the text at all, but
 * drawn after it.
 */

class SquigglesAnnotation extends ExpressiveCodeAnnotation {
    render({ nodesToTransform }: AnnotationRenderOptions) {
        return nodesToTransform.map((node) => {
            return h('span.error-squiggles', node)
        })
    }
}


/** The message each line of a block shows, which its text no longer holds. */
const messages = new WeakMap<ExpressiveCodeLine, string>()

export function pluginErrorPreview() {
    return definePlugin({
        name: 'Error Preview',
        baseStyles: `
      .error-squiggles {
        text-decoration-style: wavy;
        text-decoration-color: #f22;
        text-decoration-line: underline;
        text-decoration-skip-ink: none;

        & span {
          text-decoration: unset;
        }
      }
      .error-message {
        color: #f22;
        font-style: italic;
        background: #f002;
        padding-inline: 0.4rem;
        border-radius: 0.2rem;
        /* Not part of the code: not selected with it */
        user-select: none;
      }
    `,
        hooks: {
            preprocessCode: (context) => {
                // Only apply this to code blocks with the `error-preview` meta
                if (!context.codeBlock.meta.includes('error-preview')) return

                context.codeBlock.getLines().forEach((line) => {
                    // Take the message out of the code
                    const message = MESSAGE.exec(line.text)
                    if (message !== null) {
                        messages.set(line, message[1])
                        line.editText(message.index, line.text.length, '')
                    }

                    // Find all squiggles markup in the line
                    const matches = [...line.text.matchAll(SQUIGGLES)].reverse()
                    matches.forEach((match) => {
                        // Add a squiggles annotation to the match
                        const from = match.index || 0
                        const to = from + match[0].length
                        line.addAnnotation(
                            new SquigglesAnnotation({
                                inlineRange: {
                                    columnStart: from,
                                    columnEnd: to,
                                },
                            })
                        )
                        // Remove the squiggle markup from the code plaintext
                        line.editText(from, to, match[0].slice(2, -2))
                    })
                })
            },
            postprocessRenderedLine: ({ line, renderData }) => {
                const message = messages.get(line)
                if (message === undefined) return
                // Drawn after the line's code, in the element holding it
                const code = renderData.lineAst.children.find(
                    (child): child is Element =>
                        child.type === 'element' && getClassNames(child).includes('code')
                )
                ;(code ?? renderData.lineAst).children.push(h('span.error-message', message))
            },
        },
    })
}
