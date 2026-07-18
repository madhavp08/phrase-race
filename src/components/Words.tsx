import { useEffect, useRef } from 'react'
import type { WordState } from '../types'

interface WordsProps {
  words: WordState[]
  wordIndex: number
  focused: boolean
}

export function Words({ words, wordIndex, focused }: WordsProps) {
  const activeRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const active = activeRef.current
    const wrapper = wrapperRef.current
    if (!active || !wrapper) return

    const wrapperTop = wrapper.getBoundingClientRect().top
    const activeTop = active.getBoundingClientRect().top
    const offset = activeTop - wrapperTop + wrapper.scrollTop
    const lineHeight = active.offsetHeight || 40
    wrapper.scrollTop = Math.max(0, offset - lineHeight)
  }, [wordIndex, words])

  return (
    <div
      className={`words-wrapper ${focused ? '' : 'blurred'}`}
      ref={wrapperRef}
    >
      <div className="words">
        {words.map((word, index) => {
          const isActive = index === wordIndex
          const caretAt = isActive
            ? word.letters.findIndex((letter) => letter.status === 'untyped')
            : -1
          const caretAtEnd =
            isActive &&
            word.letters.length > 0 &&
            word.letters.every((letter) => letter.status !== 'untyped')

          return (
            <div
              key={`${word.expected}-${index}`}
              ref={isActive ? activeRef : undefined}
              className={[
                'word',
                isActive ? 'active' : '',
                word.status === 'typed' ? 'typed' : '',
                word.status === 'error' ? 'error' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {word.letters.map((letter, letterIndex) => (
                <span key={`${index}-${letterIndex}`} className="letter-wrap">
                  {caretAt === letterIndex && (
                    <span className="caret" aria-hidden="true" />
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
              {isActive && word.letters.length === 0 && (
                <span className="caret" aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
