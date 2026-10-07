import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import Footer from "../components/Footer";
import NotFound from "../app/not-found";
import LegacyCatalogueRedirect from "../app/LegacyCatalogueRedirect";
import EvidenceValue from "../components/catalogue/EvidenceValue";
afterEach(() => { vi.unstubAllGlobals(); });
it("offers recovery and key research destinations in page chrome", () => {
  const footer=renderToStaticMarkup(<Footer/>); expect(footer).toContain('href="/evidence/"'); expect(footer).toContain('href="/#downloads"');
  expect(renderToStaticMarkup(<NotFound/>)).toContain('href="/"');
});
it("preserves a legacy browse query and hash during client recovery", () => {
  const replace=vi.fn(); vi.stubGlobal("window",{location:{search:"?q=protein",hash:"#browse",replace}});
  let tree: ReturnType<typeof create>; act(()=>{tree=create(<LegacyCatalogueRedirect target="/?kind=model" label="Browse models"/>)});
  expect(replace).toHaveBeenCalled(); expect(tree!.root.findByType("a").props.href).toContain("q=protein"); act(()=>tree!.unmount());
});
it.each([
  [JSON.stringify({empty_array:[],empty_object:{},missing:null}),"attributes.data","None recorded"],
  ['""',"description","No value recorded"],
  ["broken json","name","fallback"],
  ["null","attributes.data","Not reported"],
])("renders empty and malformed evidence without losing its meaning",(valueJson,fieldPath,expected)=>{
  expect(renderToStaticMarkup(<EvidenceValue valueJson={valueJson} fieldPath={fieldPath} fallback="fallback"/>)).toContain(expected);
});

import { CountRows, CompositionCharts, CoverageChart } from "../components/catalogue/CatalogueCharts";
it("sorts coverage counts with stable ties and handles zero denominators", () => {
 const html=renderToStaticMarkup(<CompositionCharts kinds={[{label:"B",value:1},{label:"A",value:1}]} areas={[{label:"None",value:0}]}/>);
 expect(html.indexOf(">A<")).toBeLessThan(html.indexOf(">B<")); expect(html).toContain("width:0%");
 expect(renderToStaticMarkup(<CoverageChart covered={0} total={0} rows={[]}/>)).toContain("not that the benchmark has never been used");
 expect(renderToStaticMarkup(<CountRows rows={[]} title="Empty counts"/>)).toContain('aria-label="Empty counts"');
});
