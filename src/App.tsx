import { Authenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import outputs from '../amplify_outputs.json';
import '@aws-amplify/ui-react/styles.css';

import MainComponent from './pages/MainComponent';
import VideoUploadComponent from './pages/VideoUploadComponent';
import VideoShortifyComponent from './pages/VideoShortifyComponent';
import ShortsHistoryComponent from './pages/ShortsHistroyComponent';
import ShortsGalleryComponent from './pages/ShortsGalleryComponent';
import FinalShortComponent from './pages/FinalShortComponent';
import LongVideoUploadComponent from './pages/longvideo/LongVideoUploadComponent';
import LongVideoHistoryComponent from './pages/longvideo/LongVideoHistoryComponent';
import LongVideoEditorComponent from './pages/longvideo/LongVideoEditorComponent';
import LongVideoOutputComponent from './pages/longvideo/LongVideoOutputComponent';
import YouTubeConnectComponent from './pages/youtube/YouTubeConnectComponent';
import YouTubeCallbackComponent from './pages/youtube/YouTubeCallbackComponent';
import YouTubeUploadsComponent from './pages/youtube/YouTubeUploadsComponent';


Amplify.configure(outputs);

function App() {

  return (
    <Authenticator>
      {({signOut, user}) => (
        <BrowserRouter>
          <Routes>
            <Route element={<MainComponent signOut={signOut} user={user}/>}>
              <Route path="/" element={<VideoUploadComponent />}></Route>
              <Route path="/history" element={<ShortsHistoryComponent />}></Route>
              <Route path="/gallery" element={<ShortsGalleryComponent />} />
              <Route path="/history/:id" element={<VideoShortifyComponent />}></Route>
              <Route path="/shorts/:id/:highlight" element={<FinalShortComponent />}></Route>
              <Route path="/longvideo" element={<LongVideoUploadComponent />} />
              <Route path="/longvideo/history" element={<LongVideoHistoryComponent />} />
              <Route path="/longvideo/edit/:id" element={<LongVideoEditorComponent />} />
              <Route path="/longvideo/output/:id" element={<LongVideoOutputComponent />} />
              <Route path="/youtube/connect" element={<YouTubeConnectComponent />} />
              <Route path="/youtube/callback" element={<YouTubeCallbackComponent />} />
              <Route path="/youtube/uploads" element={<YouTubeUploadsComponent />} />
            </Route>
          </Routes>
        </BrowserRouter>
      )}
    </Authenticator>
  )
}

export default App
