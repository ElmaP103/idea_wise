/// <reference types="cypress" />
import 'cypress-file-upload';

describe('Cross-Browser Compatibility', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('handles file input in different browsers', () => {
    // Test file input click
    cy.get('[data-testid="file-input"]').click();
    
    // Test drag and drop
    cy.get('[data-testid="drop-zone"]')
      .attachFile('test.jpg', { subjectType: 'drag-n-drop' });
    
    // Test file selection
    cy.get('[data-testid="file-input"]')
      .attachFile('test.jpg');
  });

  it('handles different file types', () => {
    const fileTypes = [
      { fixture: 'test.jpg', name: 'test.jpg' },
      { fixture: 'test.png', name: 'test.png' },
      { fixture: 'test.pdf', name: 'test.pdf' },
      { fixture: 'test.txt', name: 'test.txt' }
    ];

    fileTypes.forEach(file => {
      cy.get('[data-testid="file-input"]')
        .attachFile(file.fixture);
      
      cy.contains(file.name).should('be.visible');
    });
  });

  it('handles different file sizes', () => {
    const sizes = [
      { size: 1024, name: '1KB' },
      { size: 1024 * 1024, name: '1MB' },
      { size: 10 * 1024 * 1024, name: '10MB' }
    ];

    sizes.forEach(({ size, name }) => {
      const file = new File(['x'.repeat(size)], `test-${name}.jpg`, { type: 'image/jpeg' });
      cy.get('[data-testid="file-input"]')
        .attachFile(file);
      
      cy.contains(`test-${name}.jpg`).should('be.visible');
    });
  });

  it('handles network conditions', () => {
    const networkConditions = [
      { name: 'slow', download: 500, upload: 500 },
      { name: 'fast', download: 10000, upload: 10000 }
    ];

    networkConditions.forEach(condition => {
      cy.intercept('POST', '/api/upload/init', {
        statusCode: 200,
        body: { uploadId: 'test-upload-id' }
      }).as('initUpload');

      cy.intercept('POST', '/api/upload/chunk', {
        statusCode: 200,
        delay: condition.name === 'slow' ? 2000 : 0
      }).as('uploadChunk');

      cy.get('[data-testid="file-input"]').attachFile('test.jpg');
      
      cy.wait('@initUpload');
      cy.wait('@uploadChunk');
      
      cy.get('[role="progressbar"]').should('be.visible');
    });
  });
}); 