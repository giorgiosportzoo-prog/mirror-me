import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import Chat from './pages/Chat';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Upload />} />
      <Route path="/profile/:id" element={<Profile />} />
      <Route path="/chat/:id" element={<Chat />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>
);
