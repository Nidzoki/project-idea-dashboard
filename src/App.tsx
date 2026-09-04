import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  Database,
  Filter,
  FolderOpen,
  Github,
  Grid2X2,
  Layers3,
  Lightbulb,
  Menu,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { categories, ideas, technologies } from './data/ideas';
import { filterAndSortIdeas } from './lib/ideaUtils';
import type { Idea, SortOption } from './types';

type Page = 'home' | 'browse' | 'categories' | 'about';

const difficultyOptions = ['Starter', 'Intermediate', 'Advanced'];

function App() {
  const [page, setPage] = useState<Page>('home');
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [technology, setTechnology] = useState('');
  const [sort, setSort] = useState<SortOption>('recommended');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const results = useMemo(
    () => filterAndSortIdeas(ideas, query, category, difficulty, technology, sort),
    [query, category, difficulty, technology, sort],
  );

  const navigate = (nextPage: Page) => {
    setSelectedIdea(null);
    setPage(nextPage);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openIdea = (idea: Idea) => {
    setSelectedIdea(idea);
    setPage('browse');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const browseWith = (nextCategory = '') => {
    setCategory(nextCategory);
    navigate('browse');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <button className="brand" onClick={() => navigate('home')} aria-label="Go to Idea Atlas home">
            <span className="brand-mark"><Sparkles size={16} strokeWidth={2.5} /></span>
            <span>idea<span className="brand-accent">atlas</span></span>
          </button>
          <button className="mobile-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle navigation">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className={`main-nav ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
            <NavItem label="Home" active={page === 'home' && !selectedIdea} onClick={() => navigate('home')} />
            <NavItem label="Browse ideas" active={page === 'browse'} onClick={() => navigate('browse')} />
            <NavItem label="Categories" active={page === 'categories'} onClick={() => navigate('categories')} />
            <NavItem label="About" active={page === 'about'} onClick={() => navigate('about')} />
          </nav>
          <a className="github-link" href="https://github.com" target="_blank" rel="noreferrer">
            <Github size={16} /> <span>Open source</span>
          </a>
        </div>
      </header>

      <main>
        {selectedIdea ? (
          <IdeaDetail idea={selectedIdea} onBack={() => setSelectedIdea(null)} />
        ) : page === 'home' ? (
          <HomePage query={query} setQuery={setQuery} onBrowse={() => navigate('browse')} onOpen={openIdea} />
        ) : page === 'browse' ? (
          <BrowsePage
            results={results}
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            technology={technology}
            setTechnology={setTechnology}
            sort={sort}
            setSort={setSort}
            onOpen={openIdea}
          />
        ) : page === 'categories' ? (
          <CategoriesPage onSelect={browseWith} />
        ) : (
          <AboutPage />
        )}
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand"><span className="brand-mark small"><Sparkles size={13} /></span> idea<span className="brand-accent">atlas</span></div>
          <p>Small ideas. Thoughtful builds. Open by default.</p>
          <span className="footer-note">Static, curated, and made for makers.</span>
        </div>
      </footer>
    </div>
  );
}

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{label}</button>;
}

function HomePage({
  query,
  setQuery,
  onBrowse,
  onOpen,
}: {
  query: string;
  setQuery: (value: string) => void;
  onBrowse: () => void;
  onOpen: (idea: Idea) => void;
}) {
  const featured = ideas.filter((idea) => idea.featured).slice(0, 3);

  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> A launchpad for your next build</div>
            <h1>Find an idea.<br /><em>Make it yours.</em></h1>
            <p className="hero-lede">A collection of practical project prompts discovered across the open web for developers, designers, and curious people who want to build something that matters.</p>
            <div className="hero-actions">
              <button className="button primary" onClick={onBrowse}>Explore all ideas <ArrowRight size={17} /></button>
              <button className="text-button" onClick={() => document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' })}>See what&apos;s featured <ArrowDownIcon /></button>
            </div>
            <div className="hero-search">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onBrowse()} placeholder="Search ideas, technologies, or topics..." aria-label="Search ideas" />
              <button onClick={onBrowse}>Search</button>
            </div>
            <div className="hero-proof"><div className="avatar-stack"><span>✦</span><span>◒</span><span>✳</span></div><span>Made for focused, curious builders</span></div>
          </div>
          <div className="hero-visual" aria-label="Idea Atlas collection preview">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="visual-card visual-card-main">
              <div className="visual-card-top"><span className="mini-label">TODAY&apos;S SPARK</span><span className="sparkle-dot">✦</span></div>
              <h3>Repository<br /><span>story</span></h3>
              <p>Turn a Git repository into a visual narrative.</p>
              <div className="visual-tags"><span>Developer Tools</span><span>Advanced</span></div>
              <div className="visual-card-footer"><span><span className="tiny-avatar">N</span> 8 min read</span><ArrowUpRight size={16} /></div>
            </div>
            <div className="floating-note note-top"><Lightbulb size={15} /><span>{ideas.length} ideas available</span></div>
            <div className="floating-note note-bottom"><span className="status-pulse" /> <span>Curated weekly</span></div>
          </div>
        </div>
      </section>

      <section className="stats-strip">
        <div className="container stats-grid">
          <Stat value={String(ideas.length)} label="ideas available" />
          <Stat value={String(categories.length)} label="categories" />
          <Stat value={String(technologies.length)} label="technologies" />
          <Stat value="100%" label="static & open" />
        </div>
      </section>

      <section className="section featured-section" id="featured">
        <div className="container">
          <SectionHeading eyebrow="Hand-picked" title="A few good places to start" action="Browse all ideas" onAction={onBrowse} />
          <div className="featured-grid">{featured.map((idea) => <IdeaCard key={idea.id} idea={idea} onOpen={onOpen} featured />)}</div>
        </div>
      </section>

      <section className="section soft-section">
        <div className="container split-section">
          <div><div className="eyebrow">How to use this atlas</div><h2>Start small.<br /><em>Stay curious.</em></h2></div>
          <div className="principles-grid">
            <Principle number="01" title="Find a direction" text="Filter by the skills you want to practice, not just the app you want to ship." />
            <Principle number="02" title="Make it specific" text="Every prompt includes a dataset, a reason to build, and a few first steps." />
            <Principle number="03" title="Share the learning" text="Build in public, make tradeoffs visible, and leave the next person a better map." />
          </div>
        </div>
      </section>
    </>
  );
}

function BrowsePage({
  results,
  query,
  setQuery,
  category,
  setCategory,
  difficulty,
  setDifficulty,
  technology,
  setTechnology,
  sort,
  setSort,
  onOpen,
}: {
  results: Idea[];
  query: string;
  setQuery: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  difficulty: string;
  setDifficulty: (value: string) => void;
  technology: string;
  setTechnology: (value: string) => void;
  sort: SortOption;
  setSort: (value: SortOption) => void;
  onOpen: (idea: Idea) => void;
}) {
  const hasFilters = Boolean(query || category || difficulty || technology);
  const clearFilters = () => { setQuery(''); setCategory(''); setDifficulty(''); setTechnology(''); };

  return (
    <section className="browse-page section">
      <div className="container">
        <div className="page-heading"><div><div className="eyebrow">The collection</div><h1>Browse ideas</h1><p>Find a project that fits your curiosity, your current skills, and the time you have.</p></div><div className="collection-count"><strong>{results.length}</strong><span>of {ideas.length} ideas</span></div></div>
        <div className="browse-layout">
          <aside className="filter-panel">
            <div className="filter-title"><span><Filter size={16} /> Filters</span>{hasFilters && <button className="clear-button" onClick={clearFilters}>Clear all</button>}</div>
            <FilterGroup label="Category" value={category} onChange={setCategory} options={categories} />
            <FilterGroup label="Difficulty" value={difficulty} onChange={setDifficulty} options={difficultyOptions} />
            <FilterGroup label="Technology" value={technology} onChange={setTechnology} options={technologies} />
            <div className="filter-tip"><Target size={17} /><div><strong>Not sure where to start?</strong><span>Try a Starter idea and build from there.</span></div></div>
          </aside>
          <div className="results-area">
            <div className="results-toolbar">
              <div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the collection..." aria-label="Search the collection" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}</div>
              <label className="sort-select"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="recommended">Recommended</option><option value="newest">Recently added</option><option value="difficulty-asc">Easiest first</option><option value="difficulty-desc">Most challenging</option></select><ChevronDown size={14} /></label>
            </div>
            {results.length > 0 ? <div className="ideas-grid">{results.map((idea) => <IdeaCard key={idea.id} idea={idea} onOpen={onOpen} />)}</div> : <EmptyState onClear={clearFilters} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoriesPage({ onSelect }: { onSelect: (category: string) => void }) {
  return (
    <section className="section">
      <div className="container">
        <div className="page-heading category-heading"><div><div className="eyebrow">Browse by direction</div><h1>Categories</h1><p>Choose a lens, then find an idea that makes you want to open your editor.</p></div></div>
        <div className="category-grid">{categories.map((categoryName, index) => {
          const categoryIdeas = ideas.filter((idea) => idea.category === categoryName);
          return <button className={`category-tile tile-${index % 4}`} key={categoryName} onClick={() => onSelect(categoryName)}><span className="category-icon">{[Grid2X2, Compass, Database, Layers3][index % 4] && (() => { const Icon = [Grid2X2, Compass, Database, Layers3][index % 4]; return <Icon size={21} />; })()}</span><span className="category-tile-name">{categoryName}</span><span className="category-tile-count">{categoryIdeas.length} {categoryIdeas.length === 1 ? 'idea' : 'ideas'} <ArrowUpRight size={15} /></span></button>;
        })}</div>
        <div className="category-callout"><div className="callout-icon"><BookOpen size={21} /></div><div><strong>Every idea is a starting point, not a specification.</strong><span>Change the audience, swap the dataset, or make the scope smaller. The best project is the one you can make your own.</span></div></div>
      </div>
    </section>
  );
}

function AboutPage() {
  return (
    <section className="section">
      <div className="container about-page">
        <div className="page-heading"><div><div className="eyebrow">The thinking behind the list</div><h1>About Idea Atlas</h1>        <p>A small, static collection of ideas found across the open web.</p></div></div>
        <div className="about-grid">
          <article className="about-main"><h2>A better blank page.</h2><p>Idea Atlas collects project ideas found in external sources, then presents them in one searchable place with source links and usage notes.</p><p>This is a static dataset reviewed before publication. There are no accounts, hidden recommendations, runtime scrapers, or browser AI calls. An optional developer-run enrichment step can make source-derived prompts more engaging while keeping their provenance intact.</p><div className="quote-block"><span className="quote-mark">“</span><p>The goal is not to find the perfect idea. It is to find a good next step.</p></div></article>
          <aside className="method-card"><div className="method-card-header"><span className="mini-label">METHODOLOGY</span><Sparkles size={17} /></div><MethodRow icon={<Check size={14} />} title="Useful by default" text="Every prompt starts with a person or problem." /><MethodRow icon={<Check size={14} />} title="Buildable in slices" text="The first three steps should create momentum." /><MethodRow icon={<Check size={14} />} title="Open about inputs" text="Sources and suggested tools are named plainly." /><MethodRow icon={<Check size={14} />} title="Friendly to remixing" text="No idea is precious; change the constraints." /></aside>
        </div>
        <div className="source-note"><Database size={17} /><div><strong>Source & attribution policy</strong><span>Ideas come from external sources. We publish normalized summaries, preserve source links, and review usage notes before adding records to the public dataset. Optional enrichment uses the unofficial ai4free / YouChat integration only during local generation; it never runs in the browser.</span></div></div>
      </div>
    </section>
  );
}

function IdeaDetail({ idea, onBack }: { idea: Idea; onBack: () => void }) {
  return (
    <section className="section detail-page">
      <div className="container">
        <button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Back to ideas</button>
        <div className={`detail-hero detail-${idea.color}`}><div className="eyebrow">Project idea · {idea.category}</div><h1>{idea.title}</h1><p>{idea.summary}</p><div className="detail-meta"><span className={`difficulty-pill difficulty-${idea.difficulty.toLowerCase()}`}>{idea.difficulty}</span>{idea.technologies.map((tech) => <span className="tag" key={tech}>{tech}</span>)}</div></div>
        <div className="detail-grid"><article className="detail-content"><DetailSection title="Why build it"><p>{idea.whyBuildIt}</p></DetailSection><DetailSection title="Suggested first steps"><ol className="steps-list">{idea.suggestedSteps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol></DetailSection></article><aside className="detail-aside"><DetailFact icon={<Database size={17} />} label="Dataset / tools" value={idea.datasetTools} /><DetailFact icon={<FolderOpen size={17} />} label="Source" value={idea.source} /><DetailFact icon={<Layers3 size={17} />} label="Category" value={idea.category} />{idea.license && <DetailFact icon={<BookOpen size={17} />} label="Licence" value={idea.license} />}{idea.sourceUrl && <a className="button secondary full-width" href={idea.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /> View original source</a>}{(idea.usageNote || idea.attribution) && <span className="save-hint">{[idea.usageNote, idea.attribution].filter(Boolean).join(' ')}</span>}</aside></div>
      </div>
    </section>
  );
}

function IdeaCard({ idea, onOpen, featured = false }: { idea: Idea; onOpen: (idea: Idea) => void; featured?: boolean }) {
  return <article className={`idea-card card-${idea.color} ${featured ? 'featured-card' : ''}`}><div className="idea-card-top"><span className="category-label">{idea.category}</span>{idea.featured && <span className="featured-label"><Sparkles size={12} /> Featured</span>}</div><button className="idea-card-link" onClick={() => onOpen(idea)}><h3>{idea.title}</h3><p>{idea.summary}</p></button><div className="tag-list">{idea.technologies.map((tech) => <span className="tag" key={tech}>{tech}</span>)}</div><div className="idea-card-bottom"><span className={`difficulty-pill difficulty-${idea.difficulty.toLowerCase()}`}>{idea.difficulty}</span><button className="round-arrow" onClick={() => onOpen(idea)} aria-label={`View ${idea.title}`}><ArrowUpRight size={16} /></button></div></article>;
}

function FilterGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="filter-group"><legend>{label}</legend><div className="filter-options">{options.map((option) => <button key={option} className={value === option ? 'selected' : ''} onClick={() => onChange(value === option ? '' : option)}>{option}<span>{value === option && <Check size={13} />}</span></button>)}</div></fieldset>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction: () => void }) {
  return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div><button className="text-button" onClick={onAction}>{action} <ArrowRight size={16} /></button></div>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}

function Principle({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="principle"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Search size={22} /></span><h3>No ideas match those filters</h3><p>Try a broader search or clear one of the filters to see more of the collection.</p><button className="button secondary" onClick={onClear}>Clear filters</button></div>;
}

function MethodRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="method-row"><span className="method-icon">{icon}</span><div><strong>{title}</strong><span>{text}</span></div></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h2>{title}</h2>{children}</section>;
}

function DetailFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="detail-fact"><span className="fact-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function ArrowDownIcon() {
  return <span className="arrow-down">↓</span>;
}

export default App;
