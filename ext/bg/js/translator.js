/*
 * Copyright (C) 2016  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


class Translator {
    constructor() {
        this.loaded = false;
        this.ruleMeta = null;
        this.database = new Database();
        this.deinflector = new Deinflector();
    }

    prepare() {
        if (this.loaded) {
            return Promise.resolve();
        }

        const promises = [
            loadJsonInt('bg/lang/deinflect.json'),
            this.database.prepare()
        ];

        return Promise.all(promises).then(([reasons]) => {
            this.deinflector.setReasons(reasons);
            this.loaded = true;
        });
    }

    findTerms(text, dictionaries, softKatakana) {
        const titles = Object.keys(dictionaries);
        const cache = {};

        return this.findTermsDeinflected(text, titles, cache).then(deinfLiteral => {
            const textHiragana = wanakana._katakanaToHiragana(text);
            if (text !== textHiragana && softKatakana) {
                return this.findTermsDeinflected(textHiragana, titles, cache).then(deinfHiragana => deinfLiteral.concat(deinfHiragana));
            } else {
                return deinfLiteral;
            }
        }).then(deinflections => {
            let definitions = [];
            for (let deinflection of deinflections) {
                for (let definition of deinflection.definitions) {
                    const tags = definition.tags.map(tag => buildTag(tag, definition.tagMeta));
                    tags.push(buildDictTag(definition.dictionary));
                    definitions.push({
                        source: deinflection.source,
                        reasons: deinflection.reasons,
                        score: definition.score,
                        id: definition.id,
                        dictionary: definition.dictionary,
                        expression: definition.expression,
                        reading: definition.reading,
                        glossary: definition.glossary,
                        tags: sortTags(tags)
                    });
                }
            }

            definitions = undupeTermDefs(definitions);
            definitions = sortTermDefs(definitions, dictionaries);

            let length = 0;
            for (let definition of definitions) {
                length = Math.max(length, definition.source.length);
            }

            return {length, definitions};
        });
    }

    findTermsGrouped(text, dictionaries, softKatakana) {
        return this.findTerms(text, dictionaries, softKatakana).then(({length, definitions}) => {
            return {length, definitions: groupTermDefs(definitions, dictionaries)};
        });
    }

    findKanji(text, dictionaries) {
        const titles = Object.keys(dictionaries);
        const processed = {};
        const promises = [];

        for (let c of text) {
            if (!processed[c]) {
                promises.push(this.database.findKanji(c, titles));
                processed[c] = true;
            }
        }

        return Promise.all(promises).then(defSets => {
            const definitions = defSets.reduce((a, b) => a.concat(b), []);
            for (let definition of definitions) {
                const tags = definition.tags.map(tag => buildTag(tag, definition.tagMeta));
                tags.push(buildDictTag(definition.dictionary));
                definition.tags = sortTags(tags);
            }

            return definitions;
        });
    }

    findTermsDeinflected(text, dictionaries, cache) {
        const definer = term => {
            if (cache.hasOwnProperty(term)) {
                return Promise.resolve(cache[term]);
            }

            return this.database.findTerms(term, dictionaries).then(definitions => cache[term] = definitions);
        };

        const promises = [];
        for (let i = text.length; i > 0; --i) {
            promises.push(this.deinflector.deinflect(text.slice(0, i), definer));
        }

        return Promise.all(promises).then(results => {
            let deinflections = [];
            for (let result of results) {
                deinflections = deinflections.concat(result);
            }

            return deinflections;
        });
    }

    processKanji(definitions) {
        for (let definition of definitions) {
            const tags = definition.tags.map(tag => buildTag(tag, definition.tagMeta));
            definition.tags = sortTags(tags);
        }

        return definitions;
    }
}
