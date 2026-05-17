// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Citation Verifier Tests
 */

import { describe, it, expect } from 'vitest'
import {
  BibTeXParser,
  CitationVerifier,
  isValidBibTeX,
  getCitationKeys,
  findDuplicateKeys,
} from '../citations.js'

describe('BibTeXParser', () => {
  const parser = new BibTeXParser()

  describe('parse', () => {
    it('parses valid BibTeX entries', () => {
      const bibtex = `
@article{smith2020,
  author = {John Smith},
  title = {A Great Paper},
  journal = {Nature},
  year = {2020}
}

@inproceedings{jones2021,
  author = {Jane Jones},
  title = {Another Paper},
  booktitle = {NeurIPS},
  year = {2021}
}
`
      const { entries, errors } = parser.parse(bibtex)

      expect(errors.length).toBe(0)
      expect(entries.length).toBe(2)
      expect(entries[0].key).toBe('smith2020')
      expect(entries[0].type).toBe('article')
      expect(entries[1].key).toBe('jones2021')
    })

    it('extracts all fields', () => {
      const bibtex = `
@article{test,
  author = {Test Author},
  title = {Test Title},
  journal = {Test Journal},
  year = {2023},
  volume = {1},
  pages = {1-10},
  doi = {10.1234/test}
}
`
      const { entries } = parser.parse(bibtex)

      expect(entries[0].fields.author).toBe('Test Author')
      expect(entries[0].fields.title).toBe('Test Title')
      expect(entries[0].fields.volume).toBe('1')
      expect(entries[0].fields.pages).toBe('1-10')
    })

    it('handles quoted values', () => {
      const bibtex = `
@article{test,
  author = "John Smith",
  title = "A Paper Title",
  year = {2023}
}
`
      const { entries } = parser.parse(bibtex)

      expect(entries[0].fields.author).toBe('John Smith')
      expect(entries[0].fields.title).toBe('A Paper Title')
    })

    it('handles numeric year values', () => {
      const bibtex = `
@article{test,
  author = {Test},
  title = {Test},
  year = 2023
}
`
      const { entries } = parser.parse(bibtex)

      expect(entries[0].fields.year).toBe('2023')
    })
  })
})

describe('CitationVerifier', () => {
  const verifier = new CitationVerifier()

  describe('verify', () => {
    it('detects duplicate keys', () => {
      const bibtex = `
@article{smith2020,
  author = {John Smith},
  title = {Paper One},
  journal = {Nature},
  year = {2020}
}

@article{smith2020,
  author = {Jane Smith},
  title = {Paper Two},
  journal = {Science},
  year = {2020}
}
`
      const result = verifier.verify(bibtex)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'duplicate_key')).toBe(true)
    })

    it('detects missing required fields', () => {
      const bibtex = `
@article{incomplete,
  author = {Test},
  title = {Test}
}
`
      const result = verifier.verify(bibtex)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'missing_field')).toBe(true)
      expect(result.errors.some((e) => e.message.includes('journal'))).toBe(true)
      expect(result.errors.some((e) => e.message.includes('year'))).toBe(true)
    })

    it('detects TODO markers in fields', () => {
      const bibtex = `
@article{test,
  author = {[TODO: add author]},
  title = {Test Title},
  journal = {Test},
  year = {2023}
}
`
      const result = verifier.verify(bibtex)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'todo_marker')).toBe(true)
    })

    it('detects ??? placeholder markers', () => {
      const bibtex = `
@article{test,
  author = {???},
  title = {Test Title},
  journal = {Test},
  year = {2023}
}
`
      const result = verifier.verify(bibtex)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'todo_marker')).toBe(true)
    })

    it('detects invalid years', () => {
      const bibtex = `
@article{test,
  author = {Test},
  title = {Test},
  journal = {Test},
  year = {1700}
}
`
      const result = verifier.verify(bibtex)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.type === 'invalid_year')).toBe(true)
    })

    it('warns about old papers', () => {
      const bibtex = `
@article{old,
  author = {Old Author},
  title = {Old Paper},
  journal = {Old Journal},
  year = {1990}
}
`
      const result = verifier.verify(bibtex)

      expect(result.warnings.some((w) => w.type === 'old_paper')).toBe(true)
    })

    it('warns about missing optional fields', () => {
      const bibtex = `
@article{test,
  author = {Test},
  title = {Test},
  journal = {Test},
  year = {2023}
}
`
      const result = verifier.verify(bibtex)

      expect(result.warnings.some((w) => w.type === 'missing_optional')).toBe(true)
    })

    it('passes valid BibTeX', () => {
      const bibtex = `
@article{valid2023,
  author = {Valid Author},
  title = {Valid Paper Title},
  journal = {Valid Journal},
  year = {2023},
  volume = {1},
  pages = {1-10},
  doi = {10.1234/valid}
}
`
      const result = verifier.verify(bibtex)

      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })
  })

  describe('formatResult', () => {
    it('formats valid result', () => {
      const bibtex = `
@article{test,
  author = {Test},
  title = {Test},
  journal = {Test},
  year = {2023}
}
`
      const result = verifier.verify(bibtex)
      const formatted = verifier.formatResult(result)

      expect(formatted).toContain('✓')
      expect(formatted).toContain('1 entries verified')
    })

    it('formats error result', () => {
      const bibtex = `
@article{test,
  author = {Test}
}
`
      const result = verifier.verify(bibtex)
      const formatted = verifier.formatResult(result)

      expect(formatted).toContain('✗')
      expect(formatted).toContain('errors found')
    })
  })
})

describe('Helper Functions', () => {
  describe('isValidBibTeX', () => {
    it('returns true for valid BibTeX', () => {
      const valid = `
@article{test,
  author = {Test},
  title = {Test},
  journal = {Test},
  year = {2023}
}
`
      expect(isValidBibTeX(valid)).toBe(true)
    })

    it('returns false for invalid BibTeX', () => {
      const invalid = `
@article{test,
  author = {Test}
}
`
      expect(isValidBibTeX(invalid)).toBe(false)
    })
  })

  describe('getCitationKeys', () => {
    it('returns all citation keys', () => {
      const bibtex = `
@article{smith2020,
  author = {Smith}, title = {A}, journal = {J}, year = {2020}
}
@book{jones2021,
  author = {Jones}, title = {B}, publisher = {P}, year = {2021}
}
`
      const keys = getCitationKeys(bibtex)

      expect(keys).toContain('smith2020')
      expect(keys).toContain('jones2021')
    })
  })

  describe('findDuplicateKeys', () => {
    it('finds duplicate keys', () => {
      const bibtex = `
@article{dup,
  author = {A}, title = {T}, journal = {J}, year = {2020}
}
@article{dup,
  author = {B}, title = {T}, journal = {J}, year = {2021}
}
@article{unique,
  author = {C}, title = {T}, journal = {J}, year = {2022}
}
`
      const duplicates = findDuplicateKeys(bibtex)

      expect(duplicates).toContain('dup')
      expect(duplicates).not.toContain('unique')
    })
  })
})
