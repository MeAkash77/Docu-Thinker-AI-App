import React, { useState, useEffect } from "react";
import { Box, Button, Typography, CircularProgress, TextField, Snackbar, Alert, Dialog, DialogTitle, DialogContent, List, ListItem, ListItemButton, ListItemText } from "@mui/material";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { GoogleLogin } from "@react-oauth/google";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import mammoth from "mammoth";

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

const UnifiedUploadModal = ({ setSummary, setOriginalText, setDocumentFile, theme }) => {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [googleCredential, setGoogleCredential] = useState(null);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Dropzone
  const onDrop = (acceptedFiles) => {
    const f = acceptedFiles[0];
    setFile(f);
    setTitle(f.name);
    setDocumentFile(f);
  };
  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [],
    },
  });

  // Text extraction
  const extractText = async (file) => {
    if (file.type === "application/pdf") {
      const pdf = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((i) => i.str).join(" ") + "\n";
      }
      return text;
    } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    }
    return "";
  };

  // Upload to backend
  const handleUpload = async () => {
    if (!file || !title) return setErrorMessage("Select file & title"), setSnackbarOpen(true);
    try {
      setLoading(true); setProgressMessage("Extracting text...");
      const text = await extractText(file);
      setProgressMessage("Summarizing...");
      const payload = { title, text, userId: localStorage.getItem("userId") };
      const res = await axios.post("https://docuthinker-app-backend-api.vercel.app/upload", payload);
      setSummary(res.data.summary); setOriginalText(res.data.originalText); localStorage.setItem("originalText", res.data.originalText);
      setLoading(false);
    } catch (e) {
      setErrorMessage("Upload failed: " + (e.response?.data?.error || e.message));
      setSnackbarOpen(true); setLoading(false);
    }
  };

  // Fetch Google Drive files
  useEffect(() => {
    if (!driveOpen || !googleCredential) return;
    const fetchFiles = async () => {
      try {
        const res = await axios.get("https://www.googleapis.com/drive/v3/files", {
          params: { pageSize: 50, fields: "files(id,name,mimeType)" },
          headers: { Authorization: `Bearer ${googleCredential.credential}` },
        });
        setDriveFiles(res.data.files);
      } catch (e) {
        setErrorMessage("Failed to fetch Drive files"); setSnackbarOpen(true);
      }
    };
    fetchFiles();
  }, [driveOpen, googleCredential]);

  return (
    <>
      <Box sx={{ width: 400, bgcolor: theme === "dark" ? "#1e1e1e" : "#fff", p: 3, borderRadius: 2, textAlign: "center" }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Upload PDF or DOCX</Typography>

        <Box {...getRootProps()} sx={{ border: "2px dashed orange", p: 2, mb: 2, cursor: "pointer" }}>
          <input {...getInputProps()} />
          <Typography>{file ? "Change file" : "Drag & drop or click"}</Typography>
        </Box>

        {file && <TextField label="Title" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} sx={{ mb: 2 }} />}

        <Button variant="contained" fullWidth sx={{ mb: 1 }} onClick={handleUpload} disabled={loading}>
          {loading ? <CircularProgress size={24} /> : "Upload"}
        </Button>

        <Typography>OR</Typography>

        <GoogleLogin
          onSuccess={(res) => { setGoogleCredential(res); setDriveOpen(true); }}
          onError={() => { setErrorMessage("Google login failed"); setSnackbarOpen(true); }}
        />
      </Box>

      {/* Google Drive Modal */}
      <Dialog open={driveOpen} onClose={() => setDriveOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ bgcolor: theme === "dark" ? "#1e1e1e" : "#fff" }}>Select Google Drive File</DialogTitle>
        <DialogContent sx={{ bgcolor: theme === "dark" ? "#1e1e1e" : "#fff" }}>
          {driveFiles.length === 0 ? <Typography>No files</Typography> :
            <List>
              {driveFiles.map(f => (
                <ListItem key={f.id} disablePadding>
                  <ListItemButton onClick={() => { setFile(f); setTitle(f.name); setDocumentFile(f); setDriveOpen(false); }}>
                    <ListItemText primary={f.name} secondary={f.mimeType} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>}
        </DialogContent>
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={() => setSnackbarOpen(false)}>
        <Alert severity="error">{errorMessage}</Alert>
      </Snackbar>
    </>
  );
};

export default UnifiedUploadModal;
