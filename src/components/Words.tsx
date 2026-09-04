import { useEffect, useRef } from 'react'
import { displayWordIndex } from '../core/readingPace'
import type { WordState } from '../types'

interface WordsProps {
  words: WordState[]
  wordIndex: number
  paceIndex?: number
}

export function Words({ words, wordIndex, paceIndex = 0 }: WordsProps) {
  const activeRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const readingIndex = displayWordIndex(wordIndex, paceIndex)

  useEffect(() => {
    const active = activeRef.current
    const wrapper = wrapperRef.current
    if (!active || !wrapper) return

    const wrapperTop = wrapper.getBoundingClientRect().top
    const activeTop = active.getBoundingClientRect().top
    const offset = activeTop - wrapperTop + wrapper.scrollTop
    const lineHeight = active.offsetHeight || 40
    wrapper.scrollTop = Math.max(0, offset - lineHeight)
  }, [readingIndex, words])

  return (
    <div className="words-wrapper" ref={wrapperRef}>
      <div className="words">
        {words.map((word, index) => {
          const isReading = index === readingIndex
          const isSpoken = index === wordIndex
          const caretAt = isSpoken
            ? word.letters.findIndex((letter) => letter.status === 'untyped')
            : -1
          const caretAtEnd =
            isSpoken &&
            word.letters.length > 0 &&
            word.letters.every((letter) => letter.status !== 'untyped')
          const showReadingCaret =
            isReading &&
            !isSpoken &&
            word.letters.every((letter) => letter.status === 'untyped')

          return (
            <div
              key={`${word.expected}-${index}`}
              ref={isReading ? activeRef : undefined}
              className={[
                'word',
                isReading ? 'active' : '',
                isSpoken && !isReading ? 'spoken' : '',
                word.status === 'typed' ? 'typed' : '',
                word.status === 'error' ? 'error' : '',
                word.status === 'preview' ? 'preview' : '',
                word.sentenceEnd ? 'sentence-end' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {word.letters.map((letter, letterIndex) => (
                <span key={`${index}-${letterIndex}`} className="letter-wrap">
                  {caretAt === letterIndex && (
                    <span className="caret" aria-hidden="true" />
                  )}
                  {showReadingCaret && letterIndex === 0 && (
                    <span className="caret reading" aria-hidden="true" />
                  )}
                  <span
                    className={[
                      'letter',
                      letter.status !== 'untyped' ? letter.status : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {letter.char}
                  </span>
                </span>
              ))}
              {caretAtEnd && <span className="caret end" aria-hidden="true" />}
              {isSpoken && word.letters.length === 0 && (
                <span className="caret" aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
