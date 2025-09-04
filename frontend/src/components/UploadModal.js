import React, { useState } from "react";
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  TextField,
  Snackbar,
  Alert,
} from "@mui/material";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import GoogleDriveFileSelectorModal from "./GoogleDriveFileSelectorModal";

// ✅ Use only pdfjs-dist (no react-pdf)
import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// ✅ Force pdf.js to use CDN worker (avoids import.meta issue)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const UploadModal = ({ setSummary, setOriginalText, setDocumentFile, theme }) => {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [openSnackbar, setOpenSnackbar] = useState(false);

  // ✅ Handle file from Google Drive
  const handleFileFromGoogleDrive = (selectedFile) => {
    setFile(selectedFile);
    setTitle(selectedFile.name);
    setDocumentFile(selectedFile);
  };

  // ✅ Dropzone
  const onDrop = (acceptedFiles) => {
    setFile(acceptedFiles[0]);
    setDocumentFile(acceptedFiles[0]);
    setTitle(acceptedFiles[0].name);
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [],
    },
  });

  // ✅ Extract text from PDF
  const extractTextFromPdf = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let extractedText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      extractedText += textContent.items.map((item) => item.str).join(" ") + "\n";
    }
    return extractedText;
  };

  // ✅ Extract text from DOCX
  const extractTextFromDocx = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  // ✅ Upload handler
  const handleUpload = async () => {
    if (!file || !title) {
      setErrorMessage("Please select a file and provide a title.");
      setOpenSnackbar(true);
      return;
    }

    try {
      setLoading(true);
      setProgressMessage("Extracting text...");
      let extractedText = "";

      if (file.type === "application/pdf") {
        extractedText = await extractTextFromPdf(file);
      } else if (
        file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        extractedText = await extractTextFromDocx(file);
      } else {
        throw new Error("Unsupported file format");
      }

      setProgressMessage("Summarizing your document...");

      const payload = { title, text: extractedText };
      const userId = localStorage.getItem("userId");
      if (userId) payload.userId = userId;

      // ✅ Use ENV variable
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/upload`,
        payload
      );

      setLoading(false);
      const { summary, originalText } = response.data;
      setSummary(summary);
      setOriginalText(originalText);
      localStorage.setItem("originalText", originalText);
      setOpen(false);
    } catch (error) {
      setLoading(false);
      const errMsg = error.response?.data?.error || error.message;
      setErrorMessage("Upload failed: " + errMsg);
      setOpenSnackbar(true);
      console.error("Upload failed:", error);
    }
  };

  return (
    <>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            width: { xs: "90%", sm: "70%", md: "400px" },
            padding: { xs: 2, sm: 4 },
            bgcolor: theme === "dark" ? "#1e1e1e" : "white",
            textAlign: "center",
            borderRadius: "12px",
            color: theme === "dark" ? "white" : "black",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Typography
            variant="h6"
            sx={{ mb: 2, fontWeight: "bold", fontSize: { xs: "16px", sm: "18px" } }}
          >
            Upload a document (PDF or DOCX)
          </Typography>

          <Box
            {...getRootProps()}
            sx={{
              border: `2px dashed ${theme === "dark" ? "white" : "#f57c00"}`,
              padding: { xs: 2, sm: 4 },
              cursor: "pointer",
              mb: 2,
            }}
          >
            <input {...getInputProps()} />
            <Typography>
              {file
                ? "Click or drag to replace file"
                : "Drag & drop a file here, or click to select"}
            </Typography>
          </Box>

          {file && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              {file.name}
            </Typography>
          )}

          {file && (
            <TextField
              label="Document Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
          )}

          <Button
            variant="contained"
            sx={{ bgcolor: "#f57c00", color: "white", width: "100%" }}
            onClick={handleUpload}
            disabled={loading}
          >
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <CircularProgress size={20} sx={{ color: "white", mr: 1 }} />
                {progressMessage}
              </Box>
            ) : (
              "Upload"
            )}
          </Button>

          <Typography sx={{ mt: 2 }}>OR</Typography>

          {/* ✅ Show Google Drive file selector button */}
          <Button
            variant="outlined"
            sx={{ mt: 2, width: "100%" }}
            onClick={() => setDriveModalOpen(true)}
          >
            Select from Google Drive
          </Button>

          <Typography sx={{ mt: 3, fontSize: "14px" }}>
            <em>
              Note: Avoid very large files. Processing may take up to 2 minutes.
            </em>
          </Typography>
        </Box>

        {/* ✅ Google Drive file picker */}
        <GoogleDriveFileSelectorModal
          open={driveModalOpen}
          handleClose={() => setDriveModalOpen(false)}
          onFileSelect={handleFileFromGoogleDrive}
          theme={theme}
        />
      </div>

      {/* ✅ Snackbar for errors */}
      <Snackbar
        open={openSnackbar}
        autoHideDuration={6000}
        onClose={() => setOpenSnackbar(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" sx={{ width: "100%" }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default UploadModal;
