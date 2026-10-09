import { describe, expect, it } from "vitest";
import { refIds, refsToNames } from "./ref-names";

const PAGE = "6ac8dc8b-9296-427b-8979-807fa4f151be";
const TAG = "6ac8dce4-aeb0-4402-8502-47db2bf7d580";
const MULTI = "6ac8dce4-0000-4402-8502-47db2bf7d580";
const BLOCK = "6ac8dd00-1111-4402-8502-47db2bf7d580";

const info = new Map([
  [PAGE, { title: "Project X", page: true }],
  [TAG, { title: "planning", page: true }],
  [MULTI, { title: "deep work", page: true }],
  [BLOCK, { title: "Some block text", page: false }],
]);

describe("refIds", () => {
  it("lists every id referenced as [[…]] or #[[…]], once", () => {
    expect(refIds(`a [[${PAGE}]] #[[${TAG}]] [[${PAGE}]] [[Plain name]]`)).toEqual([PAGE, TAG]);
  });
});

// DB graphs store refs as ids; getBlock may return them raw. Writing a raw
// #[[<uuid>]] back creates a tag named after the uuid (seen 2026-10-09).
describe("refsToNames", () => {
  it("writes page links and tags by name", () => {
    expect(refsToNames(`Review [[${PAGE}]] #[[${TAG}]]`, info)).toBe(
      "Review [[Project X]] #planning",
    );
  });

  it("brackets a tag whose name has a space", () => {
    expect(refsToNames(`Focus #[[${MULTI}]]`, info)).toBe("Focus #[[deep work]]");
  });

  it("keeps block references as ids (a name would make a new page)", () => {
    expect(refsToNames(`See [[${BLOCK}]]`, info)).toBe(`See [[${BLOCK}]]`);
  });

  it("keeps ids it knows nothing about, and names that would not survive as a link", () => {
    const odd = new Map([[PAGE, { title: "a ]] b", page: true }]]);
    expect(refsToNames(`x [[${PAGE}]] [[${TAG}]]`, odd)).toBe(`x [[${PAGE}]] [[${TAG}]]`);
  });

  it("leaves text without id refs alone", () => {
    expect(refsToNames("Plain [[Name]] #tag", info)).toBe("Plain [[Name]] #tag");
  });
});
