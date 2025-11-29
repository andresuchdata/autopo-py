package drive

import (
	"context"
	"fmt"
	"io"
	"strings"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

type Service struct {
	srv *drive.Service
}

func NewService(credentialsJSON string) (*Service, error) {
	// Parse credentials from JSON
	config, err := google.JWTConfigFromJSON(
		[]byte(credentialsJSON),
		drive.DriveReadonlyScope,
	)
	if err != nil {
		return nil, fmt.Errorf("unable to parse client secret file to config: %v", err)
	}

	// Create the JWT client
	client := config.Client(context.Background())

	// Create the Drive service
	srv, err := drive.NewService(context.Background(), option.WithHTTPClient(client))
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve Drive client: %v", err)
	}

	return &Service{srv: srv}, nil
}

type File struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	MimeType     string `json:"mimeType"`
	ModifiedTime string `json:"modifiedTime,omitempty"`
	Size         int64  `json:"size,string,omitempty"`
}

func (s *Service) ListFiles(folderID string) ([]*File, error) {
	var files []*File

	// If no folder ID is provided, use "root"
	if folderID == "" {
		folderID = "root"
	}

	// List files in the specified folder
	result, err := s.srv.Files.List().
		Q(fmt.Sprintf("'%s' in parents and trashed=false", folderID)).
		Fields("files(id, name, mimeType, modifiedTime, size)").
		Do()
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve files: %v", err)
	}

	// Convert to our File type
	for _, f := range result.Files {
		files = append(files, &File{
			ID:           f.Id,
			Name:         f.Name,
			MimeType:     f.MimeType,
			ModifiedTime: f.ModifiedTime,
			Size:         f.Size,
		})
	}

	return files, nil
}

func (s *Service) DownloadFile(fileID string, w io.Writer) error {
	resp, err := s.srv.Files.Get(fileID).Download()
	if err != nil {
		return fmt.Errorf("unable to download file: %v", err)
	}
	defer resp.Body.Close()

	_, err = io.Copy(w, resp.Body)
	return err
}

func (s *Service) FindFolderByPath(path string) (string, error) {
	if path == "" {
		return "root", nil
	}

	folders := strings.Split(path, "/")
	currentID := "root"

	for _, folder := range folders {
		if folder == "" {
			continue
		}

		result, err := s.srv.Files.List().
			Q(fmt.Sprintf("'%s' in parents and name='%s' and mimeType='application/vnd.google-apps.folder' and trashed=false",
				currentID, folder)).
			Fields("files(id, name)").
			Do()
		if err != nil {
			return "", fmt.Errorf("error finding folder %s: %v", folder, err)
		}

		if len(result.Files) == 0 {
			return "", fmt.Errorf("folder not found: %s", folder)
		}

		currentID = result.Files[0].Id
	}

	return currentID, nil
}
