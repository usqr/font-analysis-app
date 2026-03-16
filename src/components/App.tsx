import { Routes, Route } from 'react-router-dom';
import { Layout } from './Layout';
import { LibraryView } from './LibraryView';
import { AnalyzeView } from './AnalyzeView';
import { CompareView } from './CompareView';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LibraryView />} />
        <Route path="analyze/:fontId?" element={<AnalyzeView />} />
        <Route path="compare" element={<CompareView />} />
      </Route>
    </Routes>
  );
}
