/// <reference types="cypress" />
import 'cypress-file-upload';

describe('File Upload', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('uploads a file successfully', () => {
    cy.intercept('POST', '/api/upload/init', {
      statusCode: 200,
      body: { uploadId: 'test-upload-id' }
    }).as('initUpload');

    cy.intercept('POST', '/api/upload/chunk', {
      statusCode: 200
    }).as('uploadChunk');

    cy.get('[data-testid="file-input"]').attachFile('test.jpg');
    
    cy.wait('@initUpload');
    cy.wait('@uploadChunk');
    
    cy.get('[role="progressbar"]').should('be.visible');
    cy.contains('Success').should('be.visible');
  });

  it('handles upload failure', () => {
    cy.intercept('POST', '/api/upload/init', {
      statusCode: 500,
      body: { error: 'Upload failed' }
    }).as('initUpload');

    cy.get('[data-testid="file-input"]').attachFile('test.jpg');
    
    cy.wait('@initUpload');
    cy.contains('Error').should('be.visible');
  });

  it('shows upload progress', () => {
    cy.intercept('POST', '/api/upload/init', {
      statusCode: 200,
      body: { uploadId: 'test-upload-id' }
    }).as('initUpload');

    cy.intercept('POST', '/api/upload/chunk', {
      statusCode: 200,
      delay: 1000
    }).as('uploadChunk');

    cy.get('[data-testid="file-input"]').attachFile('test.jpg');
    
    cy.wait('@initUpload');
    cy.get('[role="progressbar"]').should('be.visible');
  });

  it('resumes interrupted upload', () => {
    cy.intercept('POST', '/api/upload/init', {
      statusCode: 200,
      body: { uploadId: 'test-upload-id' }
    }).as('initUpload');

    cy.intercept('POST', '/api/upload/chunk', {
      statusCode: 500,
      body: { error: 'Network error' }
    }).as('uploadChunk');

    cy.intercept('GET', '/api/upload/resume/*', {
      statusCode: 200,
      body: {
        uploadedChunks: 1,
        totalChunks: 5,
        progress: 20
      }
    }).as('resumeUpload');

    cy.get('[data-testid="file-input"]').attachFile('test.jpg');
    
    cy.wait('@initUpload');
    cy.wait('@uploadChunk');
    
    cy.contains('Resume Upload').click();
    cy.wait('@resumeUpload');
    cy.get('[role="progressbar"]').should('be.visible');
  });
}); 