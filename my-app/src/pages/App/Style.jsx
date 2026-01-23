import React from 'react';
import {
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Button,
} from '@mui/material';
import { Link } from 'react-router-dom';
import AppPageContainer from '../../components/AppPageContainer';

// Mock data for the list of styles
const mockStyles = [
  { id: 'S-001', name: '클래식 데님 자켓', season: '2026 S/S' },
  { id: 'S-002', name: '하이웨이스트 와이드 팬츠', season: '2026 S/S' },
  { id: 'S-003', name: '오버핏 린넨 셔츠', season: '2026 F/W' },
  { id: 'S-004', name: '플리츠 미디 스커트', season: '2026 F/W' },
];

const Style = () => {
  return (
    <AppPageContainer
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            스타일 관리
          </Typography>
          <Button
            component={Link}
            to="/style/new" // Assuming a route for creating a new style
            variant="contained"
            color="primary"
          >
            새 스타일 추가
          </Button>
        </div>
      }
    >
      <Paper elevation={3}>
        <List>
          {mockStyles.map((style) => (
            <ListItem key={style.id} disablePadding divider>
              <ListItemButton component={Link} to={`/style/${style.id}`}>
                <ListItemText
                  primary={style.name}
                  secondary={`스타일 코드: ${style.id} | 시즌: ${style.season}`}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>
    </AppPageContainer>
  );
};

export default Style;
